/**
 * Soorten regels in de beheerkalender.
 *
 * Bewust een eigen module zonder `'use client'`: in een client-module wordt élke
 * export een client-referentie, ook een gewone array. De server-component kreeg
 * dan geen lijst maar een proxy, en de pagina viel om met "CALENDAR_KINDS is not
 * iterable". Constanten die beide kanten nodig hebben, horen dus hier.
 */
export const CALENDAR_KINDS = ['afhaling', 'terugbrengen', 'vervoer'] as const;

export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const KIND_LABELS: Record<CalendarKind, string> = {
  afhaling: 'Afhaling',
  terugbrengen: 'Terugbrengen',
  vervoer: 'Transport',
};

/**
 * Waar de aanvraag over gaat: materiaal, flesserke of allebei (F3).
 *
 * Dit staat los van `CalendarKind`: dat zegt wát er die dag gebeurt (afhalen,
 * terugbrengen, rijden), dit zegt waarover het gaat. Zes soorten maken van de
 * kalender een kleurenwaaier; twee dimensies naast elkaar houden ze leesbaar.
 */
export const CONTENT_KINDS = ['materiaal', 'flesserke', 'beide'] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_LABELS: Record<ContentKind, string> = {
  materiaal: 'Materiaal',
  flesserke: 'Flesserke',
  beide: 'Materiaal + flesserke',
};

/** De kleur van het bolletje voor die inhoud; de legende gebruikt dezelfde. */
export const CONTENT_DOTS: Record<ContentKind, string> = {
  materiaal: 'bg-vtk-navy',
  flesserke: 'bg-vtk-yellow',
  beide: 'bg-gradient-to-r from-vtk-navy to-vtk-yellow',
};

export function contentKind(reservation: {
  lines: Array<unknown>;
  flesserkeLines: Array<unknown>;
}): ContentKind | null {
  const material = reservation.lines.length > 0;
  const drinks = reservation.flesserkeLines.length > 0;
  if (material && drinks) return 'beide';
  if (material) return 'materiaal';
  if (drinks) return 'flesserke';
  return null;
}
