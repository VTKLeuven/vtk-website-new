/**
 * De huisstijl van de mails die de site zelf opmaakt.
 *
 * Eén plek, want een mailbox laadt geen stylesheet: elke kleur en elke maat moet
 * in de html zelf staan, en dan groeien twee mails vanzelf uit elkaar. De
 * waarden hieronder zijn letterlijk de tokens uit `app/design/vtk-base.css`.
 *
 * De vorm is die van de kaarten op de site: een kaart van 600 px op het koele
 * papier, dunne haarlijnen, hoeken van 18 px, de gele streep onder een kop, en
 * knoppen als pil. Wat een mailclient niet meedoet, valt terug op iets dat nog
 * altijd leesbaar is; de uitzonderingen staan bij de functies zelf.
 *
 * Deze module is bewust puur (geen `server-only`, geen database): de
 * voorvertoning in /admin/it/flows rendert er dezelfde mails mee als de
 * verzender.
 */

export const MAIL_COLOR = {
  paper: "#eff2f8",
  paper2: "#e6ecf5",
  surface: "#ffffff",
  ink: "#0a0f1f",
  navy: "#0e1a36",
  body: "#34405e",
  muted: "#5c667f",
  yellow: "#ffd23f",
  /** Gedempte tekst op een navy vlak (`--on-dark-muted`). */
  onDarkMuted: "#b7c0dc",
  /** `--line` (10% navy) uitgerekend op wit; een mail kent geen rgba-mengsel. */
  line: "#e7e8eb",
} as const;

export const MAIL_FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

/**
 * Outlook (de Word-engine) rekent `max-width` niet mee, dus daar zou de kaart de
 * volle breedte van het venster innemen. Deze twee stukken zetten er enkel voor
 * Outlook een tabel van 600 px omheen. Andersom kan niet: een vaste breedte van
 * 600 op de kaart zelf duwt een telefoon in horizontaal scrollen.
 */
const MSO_OPEN =
  '<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->';
const MSO_CLOSE = "<!--[if mso]></td></tr></table><![endif]-->";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

/**
 * Het hele document rond de rijen van de kaart. `rows` zijn `<tr>`-elementen:
 * de kaart is een tabel, want dat is het enige wat elke mailclient op dezelfde
 * manier tekent.
 */
export function mailDocument(input: { lang: "nl" | "en"; title: string; rows: string }): string {
  return `<!doctype html><html lang="${input.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;padding:0;background:${MAIL_COLOR.paper};color:${MAIL_COLOR.ink};font-family:${MAIL_FONT}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${MAIL_COLOR.paper}"><tr><td align="center" style="padding:32px 16px">${MSO_OPEN}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:${MAIL_COLOR.surface};border:1px solid ${MAIL_COLOR.line};border-radius:18px;overflow:hidden">${input.rows}</table>${MSO_CLOSE}</td></tr></table></body></html>`;
}

/**
 * De donkere balk bovenaan met het logo, zoals de sitekop: het merkteken links
 * en waar deze mail vandaan komt rechts. De gele streep eronder hoort erbij, net
 * als op een paginakop.
 *
 * `logoUrl` moet een volledig adres zijn (`https://vtk.be/vtk-logo.png`); een
 * pad laadt niet in een mailbox.
 */
export function mailHeaderRow(input: { logoUrl: string; kicker: string }): string {
  return `<tr><td style="padding:16px 26px;background:${MAIL_COLOR.navy}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td><img src="${escapeHtml(input.logoUrl)}" width="48" alt="VTK" style="display:block;width:48px;height:auto;border:0"></td><td align="right" style="font-family:${MAIL_FONT};font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MAIL_COLOR.onDarkMuted}">${escapeHtml(input.kicker)}</td></tr></table></td></tr><tr><td style="height:4px;background:${MAIL_COLOR.yellow};font-size:0;line-height:0">&nbsp;</td></tr>`;
}

/**
 * Een kop met de gele streep eronder, even breed als de kop zelf. De tabel
 * eromheen krimpt naar de inhoud; dat is wat `width: fit-content` op het web
 * doet. Loopt de kop over twee regels, dan is de streep zo breed als de langste
 * regel, en dat is precies de bedoeling.
 */
export function mailHeading(text: string, size = 26): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:0"><h1 style="margin:0;font-family:${MAIL_FONT};font-size:${size}px;font-weight:650;line-height:1.2;letter-spacing:-.02em;color:${MAIL_COLOR.ink}">${escapeHtml(text)}</h1><div style="height:4px;margin-top:8px;border-radius:2px;background:${MAIL_COLOR.yellow};font-size:0;line-height:0">&nbsp;</div></td></tr></table>`;
}

/** De pilknop van de site. Outlook maakt de hoeken vierkant; verder identiek. */
export function mailButton(
  url: string,
  label: string,
  variant: "primary" | "secondary" = "primary",
): string {
  const style =
    variant === "primary"
      ? `background:${MAIL_COLOR.ink};color:#ffffff;border:1px solid ${MAIL_COLOR.ink}`
      : `background:${MAIL_COLOR.surface};color:${MAIL_COLOR.ink};border:1px solid #d5d9e4`;
  return `<a href="${escapeHtml(url)}" style="display:inline-block;${style};text-decoration:none;padding:12px 19px;border-radius:999px;font-family:${MAIL_FONT};font-size:14px;font-weight:700;line-height:1">${escapeHtml(label)}</a>`;
}

/** De lichtblauwe voet van de kaart, met de kleine lettertjes. */
export function mailFooterRow(text: string): string {
  return `<tr><td style="padding:16px 30px;background:${MAIL_COLOR.paper2};border-top:1px solid ${MAIL_COLOR.line};font-family:${MAIL_FONT};font-size:12px;line-height:1.5;color:${MAIL_COLOR.muted}">${escapeHtml(text)}</td></tr>`;
}
