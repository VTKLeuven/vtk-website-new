import type { AppEventMoment } from "./contract";

/**
 * De momenten van een reeks zoals de app ze krijgt. Enkel wat een rij of de
 * eventpagina toont; de eigen tekst van een moment zit al in de omschrijving
 * (`appDescription` in de route van één evenement).
 */
export function appMoments(
  moments:
    | ReadonlyArray<{ start: Date; end: Date; label?: string | null; location?: string | null }>
    | undefined,
): AppEventMoment[] {
  return (moments ?? []).map((moment) => ({
    start: moment.start.toISOString(),
    end: moment.end.toISOString(),
    label: moment.label?.trim() || null,
    location: moment.location?.trim() || null,
  }));
}
