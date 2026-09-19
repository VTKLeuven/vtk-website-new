import type { GalleryId } from './config';

/**
 * De logica achter een verwijderverzoek voor een foto, los van React, Next,
 * Prisma en de mailserver.
 *
 * **Alles hier is puur.** Dat is bewust: dit pakket kent Immich en verder
 * niets, en het mag geen `@vtk/db` of `@vtk/mail` binnenhalen. Beide apps
 * schrijven hun eigen rij en versturen hun eigen mail met hun eigen adres; wat
 * ze delen zijn de regels die niet uit elkaar mogen lopen, en die staan hier.
 *
 * Waarom dit bestaat: er was geen enkele route om te vragen dat een foto
 * weggaat. Portretrecht om te beginnen, en daarnaast de bezwaar- en
 * verwijderroute uit `docs/compliance-audit-2026-07-18.md` (art. 17 en 21 AVG).
 * De foto verwijderen is meteen ook de enige uitvoerbare manier om de
 * gezichts-embeddings kwijt te raken: die hangen aan assets, niet aan namen.
 */

/** Bovengrenzen per veld. Ruim voor een echt verzoek, krap voor een bot. */
export const TAKEDOWN_LIMITS = {
  name: 120,
  /** De maximale lengte van een e-mailadres volgens RFC 5321. */
  email: 254,
  /**
   * Een verzoek is geen brief. Wie meer uit te leggen heeft, doet dat in het
   * antwoord op de mail die de post krijgt.
   */
  message: 2000,
  /** De notitie van de beheerder bij de afhandeling. */
  note: 1000,
} as const;

/**
 * Hoeveel verzoeken één afzender per venster mag indienen.
 *
 * Drie is genoeg om een typfout te herstellen en meteen een tweede foto te
 * melden, en weinig genoeg dat een script er niets aan heeft. Dezelfde waarden
 * als het contactformulier, om dezelfde reden: geen captcha, want die kost elke
 * echte bezoeker moeite om een handvol bots tegen te houden.
 */
export const TAKEDOWN_RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 } as const;

export const TAKEDOWN_REASONS = ['ON_PHOTO', 'COPYRIGHT', 'OTHER'] as const;
export type TakedownReason = (typeof TAKEDOWN_REASONS)[number];

export type TakedownErrorCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'EMAIL_REQUIRED'
  | 'EMAIL_INVALID'
  | 'EMAIL_TOO_LONG'
  | 'REASON_INVALID'
  | 'MESSAGE_TOO_LONG'
  | 'PHOTO_UNKNOWN'
  | 'RATE_LIMITED'
  | 'SAVE_FAILED';

/** Een gecontroleerd verzoek, klaar om weg te schrijven. */
export type TakedownSubmission = {
  albumSlug: string;
  assetId: string;
  name: string;
  email: string;
  reason: TakedownReason;
  /** Vrije toelichting; leeg is toegestaan. */
  message: string;
};

/** Ruwe invoer zoals ze uit een `FormData` komt: alles kan ontbreken. */
export type RawTakedownInput = {
  albumSlug?: unknown;
  assetId?: unknown;
  name?: unknown;
  email?: unknown;
  reason?: unknown;
  message?: unknown;
  /** Het honeypot-veld; ingevuld betekent bot. */
  honeypot?: unknown;
};

export type TakedownParseResult =
  | { status: 'ok'; submission: TakedownSubmission }
  | { status: 'honeypot' }
  | { status: 'error'; code: TakedownErrorCode };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;
const CONTROL_CHARS_KEEP_BREAKS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toSingleLine(value: unknown): string {
  return asString(value).replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

function toMessageText(value: unknown): string {
  return asString(value).replace(/\r\n?/g, '\n').replace(CONTROL_CHARS_KEEP_BREAKS, '').trim();
}

/**
 * Een adres met precies één apenstaartje, iets ervoor, en een domein met een
 * punt erin. Bewust niet strenger: de enige echte test of een adres bestaat is
 * er een mail naartoe sturen, en een te strikte regex weigert geldige adressen.
 */
const EMAIL_PATTERN = /^[^\s@,;:<>"]+@[^\s@,;:<>".]+(?:\.[^\s@,;:<>".]+)+$/;

export function isValidTakedownEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function isTakedownReason(value: unknown): value is TakedownReason {
  return typeof value === 'string' && (TAKEDOWN_REASONS as readonly string[]).includes(value);
}

/**
 * Controleert de invoer van het formulier.
 *
 * Geeft fouten terug in plaats van ze te gooien: een leeg veld is verwachte
 * invoer en hoort een rode toast te geven, geen error boundary (zie CLAUDE.md).
 */
export function parseTakedownSubmission(raw: RawTakedownInput): TakedownParseResult {
  // Eerst de honeypot: een bot die enkel dat veld invult mag geen foutmelding
  // krijgen waaruit hij kan leren.
  if (toSingleLine(raw.honeypot) !== '') return { status: 'honeypot' };

  // Album en foto komen uit verborgen velden die wij zelf gerenderd hebben.
  // Ontbreken ze, dan is het formulier gemanipuleerd of stuk; in beide gevallen
  // valt er niets zinnigs mee te doen.
  const albumSlug = toSingleLine(raw.albumSlug);
  const assetId = toSingleLine(raw.assetId);
  if (albumSlug === '' || assetId === '') return { status: 'error', code: 'PHOTO_UNKNOWN' };

  const name = toSingleLine(raw.name);
  if (name === '') return { status: 'error', code: 'NAME_REQUIRED' };
  if (name.length > TAKEDOWN_LIMITS.name) return { status: 'error', code: 'NAME_TOO_LONG' };

  const email = toSingleLine(raw.email);
  if (email === '') return { status: 'error', code: 'EMAIL_REQUIRED' };
  if (email.length > TAKEDOWN_LIMITS.email) return { status: 'error', code: 'EMAIL_TOO_LONG' };
  if (!isValidTakedownEmail(email)) return { status: 'error', code: 'EMAIL_INVALID' };

  if (!isTakedownReason(raw.reason)) return { status: 'error', code: 'REASON_INVALID' };

  // De toelichting mag leeg zijn: "ik sta erop en ik wil het niet" is een
  // volledig verzoek, en een verplicht motivatieveld is een drempel die niemand
  // hoort te moeten nemen om van een foto af te raken.
  const message = toMessageText(raw.message);
  if (message.length > TAKEDOWN_LIMITS.message) return { status: 'error', code: 'MESSAGE_TOO_LONG' };

  return { status: 'ok', submission: { albumSlug, assetId, name, email, reason: raw.reason, message } };
}

// -----------------------------------------------------------------------------
// De mail naar de post
// -----------------------------------------------------------------------------

const REASON_LABELS: Record<TakedownReason, string> = {
  ON_PHOTO: 'De melder staat zelf op de foto',
  COPYRIGHT: 'Auteursrecht of een andere claim op het beeld',
  OTHER: 'Andere reden',
};

export function takedownReasonLabel(reason: TakedownReason): string {
  return REASON_LABELS[reason];
}

const GALLERY_LABELS: Record<GalleryId, string> = {
  main: 'vtk.be',
  fakbar: "'t ElixIr",
};

/**
 * De mail die de post krijgt. Nederlands, ook vanaf de tweetalige hoofdsite:
 * dit bericht gaat naar een VTK-mailbox en niet naar de melder.
 *
 * De naam en het bericht van de melder staan in de tekst maar nooit in de
 * afzender; die moet een adres blijven dat onze mailserver mag ondertekenen,
 * anders vangt SPF/DKIM het bericht weg. De melder zit in `replyTo`.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return map[ch] ?? ch;
  });
}

export function takedownMailBody(input: {
  gallery: GalleryId;
  submission: TakedownSubmission;
  albumTitle: string;
  photoFilename: string;
  /** Waar de beheerder het verzoek kan afhandelen. */
  adminUrl: string;
  /** De publieke pagina van het album, om de foto te kunnen bekijken. */
  albumUrl: string;
}): { subject: string; text: string; html: string } {
  const { submission } = input;
  const lines = [
    `Er is gevraagd om een foto uit de galerij van ${GALLERY_LABELS[input.gallery]} te halen.`,
    '',
    `Album:  ${input.albumTitle}`,
    `Foto:   ${input.photoFilename}`,
    `Reden:  ${takedownReasonLabel(submission.reason)}`,
    '',
    `Melder: ${submission.name} <${submission.email}>`,
  ];

  if (submission.message) lines.push('', 'Toelichting:', submission.message);

  lines.push(
    '',
    `Album bekijken:     ${input.albumUrl}`,
    `Verzoek afhandelen: ${input.adminUrl}`,
    '',
    'Antwoorden op deze mail gaat rechtstreeks naar de melder.',
  );

  const subject = `Verwijderverzoek foto: ${input.albumTitle}`;

  const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const items = [
    { label: 'Album', value: input.albumTitle },
    { label: 'Foto', value: input.photoFilename },
    { label: 'Reden', value: takedownReasonLabel(submission.reason) },
    { label: 'Melder', value: `${submission.name} (${submission.email})` },
  ];

  const rows = items
    .map(
      (item, idx) =>
        `<tr><td valign="top" style="padding:10px 14px;${
          idx > 0 ? 'border-top:1px solid #e7e8eb;' : ''
        }font-family:${FONT};font-size:12.5px;font-weight:600;color:#5c667f;white-space:nowrap;width:125px">${escapeHtml(
          item.label,
        )}</td><td valign="top" style="padding:10px 14px;${
          idx > 0 ? 'border-top:1px solid #e7e8eb;' : ''
        }font-family:${FONT};font-size:14px;color:#0a0f1f;line-height:1.5">${escapeHtml(
          item.value,
        )}</td></tr>`,
    )
    .join('');

  const tableHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid #e7e8eb;border-radius:14px;overflow:hidden;background:#e6ecf5;margin:18px 0">${rows}</table>`;

  const messageBox = submission.message
    ? `<div style="margin:18px 0;padding:14px 18px;border-left:4px solid #ffd23f;background:#eff2f8;border-radius:0 12px 12px 0;font-family:${FONT}"><div style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5c667f;margin-bottom:6px">Toelichting van de melder</div><div style="font-size:14.5px;line-height:1.6;color:#34405e;white-space:pre-wrap">${escapeHtml(
        submission.message,
      )}</div></div>`
    : '';

  const buttons = `<a href="${escapeHtml(
    input.adminUrl,
  )}" style="display:inline-block;background:#0a0f1f;color:#ffffff;border:1px solid #0a0f1f;text-decoration:none;padding:12px 19px;border-radius:999px;font-family:${FONT};font-size:14px;font-weight:700;line-height:1">Verzoek afhandelen</a> <span style="display:inline-block;width:8px"></span> <a href="${escapeHtml(
    input.albumUrl,
  )}" style="display:inline-block;background:#ffffff;color:#0a0f1f;border:1px solid #d5d9e4;text-decoration:none;padding:12px 19px;border-radius:999px;font-family:${FONT};font-size:14px;font-weight:700;line-height:1">Album bekijken</a>`;

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    subject,
  )}</title></head><body style="margin:0;padding:0;background:#eff2f8;color:#0a0f1f;font-family:${FONT}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#eff2f8"><tr><td align="center" style="padding:32px 16px"><!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]--><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e8eb;border-radius:18px;overflow:hidden"><tr><td style="padding:16px 26px;background:#0e1a36"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td><img src="https://vtk.be/vtk-logo.png" width="48" alt="VTK" style="display:block;width:48px;height:auto;border:0"></td><td align="right" style="font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#b7c0dc">VTK Galerij (${escapeHtml(
    GALLERY_LABELS[input.gallery],
  )})</td></tr></table></td></tr><tr><td style="height:4px;background:#ffd23f;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:28px 30px 30px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:0"><h1 style="margin:0;font-family:${FONT};font-size:26px;font-weight:650;line-height:1.2;letter-spacing:-.02em;color:#0a0f1f">Verwijderverzoek foto</h1><div style="height:4px;margin-top:8px;border-radius:2px;background:#ffd23f;font-size:0;line-height:0">&nbsp;</div></td></tr></table><p style="margin:16px 0;font-family:${FONT};font-size:15.5px;line-height:1.6;color:#34405e">Er is gevraagd om een foto uit de galerij van <strong>${escapeHtml(
    GALLERY_LABELS[input.gallery],
  )}</strong> te halen:</p>${tableHtml}${messageBox}<div style="margin:22px 0 10px">${buttons}</div></td></tr><tr><td style="padding:16px 30px;background:#e6ecf5;border-top:1px solid #e7e8eb;font-family:${FONT};font-size:12px;line-height:1.5;color:#5c667f">Antwoorden op deze mail gaat rechtstreeks naar de melder via het antwoordadres.</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;

  return {
    subject,
    text: lines.join('\n'),
    html,
  };
}

// -----------------------------------------------------------------------------
// Snelheidslimiet
// -----------------------------------------------------------------------------

/** Alleen de tijdstippen binnen het venster tellen nog mee. */
export function withinTakedownWindow(hits: readonly number[], now: number, windowMs: number): number[] {
  const oldest = now - windowMs;
  return hits.filter((hit) => hit > oldest);
}

/**
 * Een schuivend venster per sleutel (hier: per IP), in het geheugen van het
 * proces. Zelfde afweging als bij het contactformulier: geen tabel en geen
 * Redis, want dit hoeft geen boekhouding te zijn maar een drempel. De prijs is
 * dat de teller per instantie telt en bij een herstart leegloopt.
 */
export class TakedownRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Boven dit aantal sleutels ruimen we de verlopen vensters op. */
    private readonly maxKeys = 5000,
  ) {}

  /**
   * Registreert een poging. Geeft `false` wanneer het venster vol zit; dan is
   * er niets bijgeteld, zodat een bot zijn eigen straf niet kan verlengen door
   * te blijven kloppen.
   */
  take(key: string, now: number = Date.now()): boolean {
    const recent = withinTakedownWindow(this.hits.get(key) ?? [], now, this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, hits] of this.hits) {
      if (withinTakedownWindow(hits, now, this.windowMs).length === 0) this.hits.delete(key);
    }
  }
}

/** Het IP dat we mogen geloven; Caddy zet de echte client op de laatste hop. */
export function takedownClientKey(headers: { get(name: string): string | null }): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || 'unknown';
}
