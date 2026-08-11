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
  vervoer: 'Vervoer',
};
