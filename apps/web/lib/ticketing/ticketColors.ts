/**
 * Het palet voor `TicketType.color`.
 *
 * Bewust een vaste lijst keys en geen vrije hexwaarde. De scanner vult er een
 * vlak van een halve telefoon mee, in het donker, op armlengte; een zelfgekozen
 * kleur is daar vroeg of laat onleesbaar. Hetzelfde patroon als
 * `DashboardTile.color`.
 *
 * De kleuren zelf staan als CSS-variabelen in `app/design/vtk-tickets.css`
 * (`--ticket-color-<key>` en `--ticket-color-<key>-ink`); hier staan enkel de
 * keys en hun naam. Wie het palet retuneert, doet dat in die ene CSS-file.
 *
 * Deze module is bewust vrij van server-only imports: de scanner draait hem in
 * de browser, ook offline.
 */

export const TICKET_COLORS = [
  { key: "navy", nl: "Navy", en: "Navy" },
  { key: "blue", nl: "Blauw", en: "Blue" },
  { key: "amber", nl: "Amber", en: "Amber" },
  { key: "violet", nl: "Paars", en: "Violet" },
  { key: "green", nl: "Groen", en: "Green" },
  { key: "rose", nl: "Roze", en: "Pink" },
  { key: "slate", nl: "Grijs", en: "Grey" },
] as const;

export type TicketColorKey = (typeof TICKET_COLORS)[number]["key"];

export const DEFAULT_TICKET_COLOR: TicketColorKey = "navy";

const KEYS = new Set<string>(TICKET_COLORS.map((color) => color.key));

/**
 * Normaliseert wat er uit een formulier of uit de databank komt naar een key uit
 * het palet. Een onbekende waarde valt terug op de standaardkleur in plaats van
 * te gooien: een tickettype met een rare kleur mag geen scan blokkeren.
 */
export function ticketColorKey(value: unknown): TicketColorKey {
  return typeof value === "string" && KEYS.has(value) ? (value as TicketColorKey) : DEFAULT_TICKET_COLOR;
}

/** De naam van een kleur, voor een label of een `title`. */
export function ticketColorLabel(value: unknown, locale: "nl" | "en" = "nl"): string {
  const key = ticketColorKey(value);
  const entry = TICKET_COLORS.find((color) => color.key === key)!;
  return locale === "en" ? entry.en : entry.nl;
}
