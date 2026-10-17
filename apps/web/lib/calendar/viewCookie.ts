/**
 * De weergave waarin iemand de kalender het laatst bekeek (raster, agenda of
 * week). Wie op /kalender de week kiest, wil de volgende keer niet opnieuw op
 * het raster landen en terugklikken.
 *
 * Een cookie en geen kolom in de databank, zoals de ingeklapte adminzijbalk
 * (`lib/adminNavCookie.ts`): de pagina leest hem op de server, zodat de
 * kalender meteen in de juiste weergave rendert en ook meteen de juiste
 * periode ophaalt, en het werkt evengoed zonder account.
 *
 * Staat los van `KalenderEditorialView.tsx`: een constante uit een
 * `'use client'`-bestand komt in een server component niet als string binnen.
 */
export const CALENDAR_VIEW_COOKIE = "vtk-kalender-weergave";

export const CALENDAR_VIEWS = ["grid", "agenda", "week"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Een onbekende of ontbrekende waarde opent op het raster, de standaard. */
export function parseCalendarView(value: string | null | undefined): CalendarView {
  return CALENDAR_VIEWS.find((view) => view === value) ?? "grid";
}
