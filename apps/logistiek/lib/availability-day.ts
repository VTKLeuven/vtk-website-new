/**
 * Rekenwerk voor het intekenen van beschikbaarheid per dag (V1).
 *
 * Puur en zonder databank, om dezelfde reden als `week-lanes.ts`: dit is het
 * enige stuk waar iets fout kan gaan zonder dat je het ziet. Een venster dat
 * over middernacht loopt en waarvan je één dag herschrijft, mag de andere dag
 * niet stil wegvegen.
 */

export type Range = { startAt: Date; endAt: Date };

/**
 * Aaneensluitende of overlappende bereiken samenvoegen.
 *
 * `<=` en niet `<`: twee vensters die op elkaar aansluiten (12:00-14:00 en
 * 14:00-18:00) zijn één blok van 12 tot 18. Als twee losse banden zien ze eruit
 * als een gaatje dat er niet is; dezelfde regel als in
 * `addAvailabilityAction`.
 */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges]
    .filter((range) => range.endAt.getTime() > range.startAt.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.startAt.getTime() <= last.endAt.getTime()) {
      if (range.endAt.getTime() > last.endAt.getTime()) last.endAt = new Date(range.endAt);
      continue;
    }
    out.push({ startAt: new Date(range.startAt), endAt: new Date(range.endAt) });
  }
  return out;
}

/**
 * Wat er van een venster overblijft buiten één dag.
 *
 * Nul, één of twee stukken: een venster van vrijdagavond tot zondagochtend
 * waarvan je zaterdag herschrijft, houdt een stuk vrijdag én een stuk zondag
 * over. Zonder deze splitsing wist het intekenen van één dag stil de dagen
 * ernaast.
 */
export function clipOutsideDay(range: Range, dayStart: Date, dayEnd: Date): Range[] {
  const out: Range[] = [];
  if (range.startAt.getTime() < dayStart.getTime()) {
    out.push({
      startAt: new Date(range.startAt),
      endAt: new Date(Math.min(range.endAt.getTime(), dayStart.getTime())),
    });
  }
  if (range.endAt.getTime() > dayEnd.getTime()) {
    out.push({
      startAt: new Date(Math.max(range.startAt.getTime(), dayEnd.getTime())),
      endAt: new Date(range.endAt),
    });
  }
  return out.filter((piece) => piece.endAt.getTime() > piece.startAt.getTime());
}

/**
 * Aangevinkte uurvakjes omzetten naar bereiken.
 *
 * `hours` zijn uren sinds middernacht op deze dag (0 tot en met 23), in gelijk
 * welke volgorde. Opeenvolgende uren worden één bereik: acht losse vakjes van
 * 09 tot 17 zijn één venster van 09:00 tot 17:00, en niet acht vensters van een
 * uur waar het beheer zich een weg doorheen moet lezen.
 *
 * `dayStart` is het begin van de Belgische dag als tijdstip; de aanroeper rekent
 * dat om met `startOfBrusselsDay`, zodat een zomeruurwissel hier geen rol speelt.
 */
export function hoursToRanges(hours: readonly number[], dayStart: Date): Range[] {
  const sorted = [...new Set(hours)].filter((hour) => hour >= 0 && hour < 24).sort((a, b) => a - b);
  const out: Range[] = [];
  const HOUR_MS = 60 * 60 * 1000;

  for (const hour of sorted) {
    const last = out[out.length - 1];
    const start = new Date(dayStart.getTime() + hour * HOUR_MS);
    const end = new Date(start.getTime() + HOUR_MS);
    if (last && last.endAt.getTime() === start.getTime()) {
      last.endAt = end;
      continue;
    }
    out.push({ startAt: start, endAt: end });
  }
  return out;
}

/**
 * De uren die een venster raakt op deze dag, om de vakjes mee te vullen.
 *
 * Een venster van 09:15 tot 12:00 kleurt de vakjes 9, 10 en 11: het vakje is
 * een uur breed, en half kleuren bestaat niet. Dat is ook waarom het intekenen
 * op een telefoon per uur gaat en niet per kwartier; met de vinger mik je geen
 * kwartier.
 */
export function rangeToHours(range: Range, dayStart: Date, dayEnd: Date): number[] {
  const HOUR_MS = 60 * 60 * 1000;
  const from = Math.max(range.startAt.getTime(), dayStart.getTime());
  const to = Math.min(range.endAt.getTime(), dayEnd.getTime());
  if (to <= from) return [];
  const first = Math.floor((from - dayStart.getTime()) / HOUR_MS);
  // Het laatste uur dat nog écht geraakt wordt: een venster tot 12:00 raakt uur
  // 11 en niet uur 12.
  const last = Math.ceil((to - dayStart.getTime()) / HOUR_MS) - 1;
  const out: number[] = [];
  for (let hour = Math.max(0, first); hour <= Math.min(23, last); hour += 1) out.push(hour);
  return out;
}
