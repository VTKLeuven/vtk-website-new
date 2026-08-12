/**
 * De logica achter het contactformulier, los van React en van Next.
 *
 * Alles hier is puur (op `Date.now()` als standaardwaarde na), zodat de
 * validatie, de honeypot en het venster van de snelheidslimiet te testen zijn
 * zonder een render, een request of een mailserver. De server action in
 * `app/actions/contact.ts` doet enkel nog het I/O-werk: headers lezen en mailen.
 */

/** Bovengrenzen per veld. Ruim genoeg voor een echt bericht, krap genoeg voor een bot. */
export const CONTACT_LIMITS = {
  /** Een naam die niet in 120 tekens past, is geen naam. */
  name: 120,
  /** De maximale lengte van een e-mailadres volgens RFC 5321. */
  email: 254,
  subject: 150,
  /**
   * Vier duizend tekens is ongeveer anderhalve A4. Wie meer te vertellen heeft,
   * mailt beter rechtstreeks; het formulier is geen documentupload.
   */
  message: 4000,
} as const;

/**
 * Hoeveel berichten één afzender per venster mag versturen.
 *
 * Drie is genoeg om een typfout te herstellen en meteen nog iets na te sturen,
 * en weinig genoeg dat een script er niets aan heeft. Bewust geen captcha: die
 * kost elke echte bezoeker moeite om een handvol bots tegen te houden.
 */
export const CONTACT_RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 } as const;

export type ContactErrorCode =
  | "NAME_REQUIRED"
  | "NAME_TOO_LONG"
  | "EMAIL_REQUIRED"
  | "EMAIL_INVALID"
  | "EMAIL_TOO_LONG"
  | "SUBJECT_REQUIRED"
  | "SUBJECT_TOO_LONG"
  | "MESSAGE_REQUIRED"
  | "MESSAGE_TOO_LONG"
  | "RATE_LIMITED"
  | "MAIL_FAILED";

/** Een gecontroleerd bericht, klaar om te mailen. */
export type ContactMessage = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

/** Ruwe invoer zoals ze uit een `FormData` komt: alles kan ontbreken. */
export type RawContactInput = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  /**
   * Het honeypot-veld. Staat verborgen in het formulier, dus een mens laat het
   * leeg; een bot die blind elk veld invult, verraadt zich hiermee.
   */
  honeypot?: unknown;
};

export type ContactParseResult =
  /** Klaar om te versturen. */
  | { status: "ok"; message: ContactMessage }
  /**
   * De honeypot was ingevuld. De aanroeper doet niets en meldt tóch succes: een
   * bot die een foutmelding krijgt, weet dat hij ontdekt is en probeert opnieuw.
   */
  | { status: "honeypot" }
  | { status: "error"; code: ContactErrorCode };

/** Controltekens; nooit legitieme invoer, wel het gereedschap van header-injectie. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

/** Idem, maar de tab (09) en de nieuwe regel (0a) blijven staan. */
const CONTROL_CHARS_KEEP_BREAKS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Maakt van vrije invoer één regel: controltekens (inclusief nieuwe regels)
 * worden spaties, en opeenvolgende spaties worden er één.
 *
 * Dit is niet enkel cosmetisch. Naam en onderwerp komen in de kopregels van de
 * mail terecht; een regeleinde daarin is header-injectie.
 */
export function toSingleLine(value: unknown): string {
  return asString(value).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * De tekst van het bericht: nieuwe regels blijven staan (die zijn hier
 * betekenisvol), de rest van de controltekens niet.
 */
export function toMessageText(value: unknown): string {
  return asString(value)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_KEEP_BREAKS, "")
    .trim();
}

/**
 * Een adres met precies één apenstaartje, iets ervoor, en een domein met een
 * punt erin. Bewust niet strenger: de enige echte test of een adres bestaat, is
 * er een mail naartoe sturen, en een te strikte regex weigert geldige adressen.
 */
const EMAIL_PATTERN = /^[^\s@,;:<>"]+@[^\s@,;:<>".]+(?:\.[^\s@,;:<>".]+)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

/**
 * Controleert de invoer van het formulier.
 *
 * Geeft fouten terug in plaats van ze te gooien: een leeg veld of een te lang
 * bericht is verwachte invoer en hoort een rode toast te geven, geen error
 * boundary (zie CLAUDE.md).
 */
export function parseContactSubmission(raw: RawContactInput): ContactParseResult {
  // Eerst de honeypot: een bot die enkel dat veld invult, mag geen enkele
  // foutmelding krijgen waaruit hij kan leren.
  if (toSingleLine(raw.honeypot) !== "") return { status: "honeypot" };

  const name = toSingleLine(raw.name);
  if (name === "") return { status: "error", code: "NAME_REQUIRED" };
  if (name.length > CONTACT_LIMITS.name) return { status: "error", code: "NAME_TOO_LONG" };

  const email = toSingleLine(raw.email);
  if (email === "") return { status: "error", code: "EMAIL_REQUIRED" };
  if (email.length > CONTACT_LIMITS.email) return { status: "error", code: "EMAIL_TOO_LONG" };
  if (!isValidEmail(email)) return { status: "error", code: "EMAIL_INVALID" };

  const subject = toSingleLine(raw.subject);
  if (subject === "") return { status: "error", code: "SUBJECT_REQUIRED" };
  if (subject.length > CONTACT_LIMITS.subject) {
    return { status: "error", code: "SUBJECT_TOO_LONG" };
  }

  const message = toMessageText(raw.message);
  if (message === "") return { status: "error", code: "MESSAGE_REQUIRED" };
  if (message.length > CONTACT_LIMITS.message) {
    return { status: "error", code: "MESSAGE_TOO_LONG" };
  }

  return { status: "ok", message: { name, email, subject, message } };
}

// -----------------------------------------------------------------------------
// Snelheidslimiet
// -----------------------------------------------------------------------------

/** Alleen de tijdstippen binnen het venster tellen nog mee. */
export function withinWindow(hits: readonly number[], now: number, windowMs: number): number[] {
  const oldest = now - windowMs;
  return hits.filter((hit) => hit > oldest);
}

/**
 * Een schuivend venster per sleutel (hier: per IP), in het geheugen van het
 * proces.
 *
 * Bewust geen tabel en geen Redis: dit hoeft geen boekhouding te zijn, enkel een
 * drempel. De prijs is dat de teller per instantie telt en bij een herstart
 * leegloopt; voor een contactformulier is dat ruim genoeg.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Boven dit aantal sleutels ruimen we de verlopen vensters op. */
    private readonly maxKeys = 5000,
  ) {}

  /**
   * Registreert een poging. Geeft `false` wanneer het venster vol zit; dan is er
   * niets bijgeteld, zodat een bot zijn eigen straf niet kan verlengen door te
   * blijven kloppen.
   */
  take(key: string, now: number = Date.now()): boolean {
    const recent = withinWindow(this.hits.get(key) ?? [], now, this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.sweep(now);
    return true;
  }

  /** Gooit de sleutels weg waarvan het venster helemaal verlopen is. */
  sweep(now: number = Date.now()): void {
    for (const [key, hits] of this.hits) {
      const recent = withinWindow(hits, now, this.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  /** Hoeveel sleutels er op dit moment bijgehouden worden. Voor tests. */
  get size(): number {
    return this.hits.size;
  }

  /** Alles vergeten. Voor tests; in productie is er geen reden toe. */
  reset(): void {
    this.hits.clear();
  }
}

/**
 * De sleutel waarop we tellen: het IP-adres zoals de proxy het doorgeeft.
 *
 * Dezelfde volgorde als `lib/ticketing/http.ts`: `x-real-ip` eerst, en anders de
 * *laatste* waarde van `x-forwarded-for`. De client kan die header zelf
 * meesturen, dus alleen de laatste (die onze eigen proxy toevoegde) is te
 * vertrouwen. Zonder header vallen alle bezoekers op één sleutel; dat is streng,
 * maar streng de goede kant op.
 */
export function clientKeyFromHeaders(headers: { get(name: string): string | null }): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}

// -----------------------------------------------------------------------------
// De mail zelf
// -----------------------------------------------------------------------------

/**
 * Onderwerp en tekst van de mail naar `info@vtk.be`.
 *
 * Het onderwerp draagt een vast voorvoegsel, zodat de mailbox in één oogopslag
 * ziet dat dit via de website binnenkwam en er een filter of label op kan staan.
 * Naam en adres staan ook in de tekst: wie de mail doorstuurt, verliest het
 * antwoordadres anders.
 */
export function contactMailBody(message: ContactMessage): { subject: string; text: string } {
  return {
    subject: `[Website] ${message.subject}`,
    text: [
      `Van: ${message.name} <${message.email}>`,
      `Onderwerp: ${message.subject}`,
      "",
      message.message,
      "",
      "--",
      "Verstuurd via het contactformulier op vtk.be. Antwoorden gaat rechtstreeks naar de afzender.",
    ].join("\n"),
  };
}
