/**
 * Rekenwerk voor het intekenen van beschikbaarheid per dag (V1).
 *
 * Puur en zonder databank, om dezelfde reden als `week-lanes.ts`: dit is het
 * enige stuk waar iets fout kan gaan zonder dat je het ziet. Een venster dat
 * over middernacht loopt en waarvan je één dag herschrijft, mag de andere dag
 * niet stil wegvegen.
 */

import { brusselsOffsetMs, startOfBrusselsDay } from './week-lanes';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Vanaf welk uur een dag begint op het intekenscherm (F4.2).
 *
 * Zaterdagnacht 02:00 hoort bij zaterdag. Wie tot twee uur 's nachts rijdt,
 * heeft dat niet op zondag gedaan, en toch stond het vakje daar: bovenaan de
 * kolom ernaast, twintig rijen van zaterdagavond vandaan. Eén veeg van 22:00
 * tot 02:00 bestond niet; het waren twee vensters op twee dagen, en wie het
 * tweede vergat, stond in de planning als niet-beschikbaar op precies het uur
 * waarop er gereden wordt.
 *
 * Vijf en niet vier of zes: het is het uur waarop hier zeker niemand meer
 * onderweg is, en het laat de late uren bij de avond waar ze bij horen.
 *
 * **Dit verschuift enkel waar een dag een eenheid is**: het intekenraster en de
 * actie die één dag herschrijft. De vensters zelf blijven gewone tijdstippen,
 * dus de planning, de agendafeed en de beschikbaarheidsband hoeven hier niets
 * van te weten.
 */
export const DAG_START_UUR = 5;

/**
 * Het begin en het einde van één intekendag.
 *
 * `dayAsUtcMidnight` is een dag zoals de rest van de app ze doorgeeft:
 * UTC-middernacht van een Belgische datum. De dagrand zelf is Belgisch, want
 * anders knipt een zomeruurwissel de dag een uur naast de klok.
 */
export function availabilityDayBounds(dayAsUtcMidnight: Date): { dayStart: Date; dayEnd: Date } {
  const offset = DAG_START_UUR * HOUR_MS;
  const next = new Date(dayAsUtcMidnight.getTime() + DAY_MS);
  return {
    dayStart: new Date(startOfBrusselsDay(dayAsUtcMidnight) + offset),
    dayEnd: new Date(startOfBrusselsDay(next) + offset),
  };
}

/**
 * Welk uur er op de klok staat bij vakje `cell`.
 *
 * Vakje 0 is 05:00 en vakje 23 is 04:00 de ochtend erna. De vakjes zelf blijven
 * tellen vanaf het begin van de dag (0 tot en met 23), zodat alles hieronder en
 * de server met hetzelfde getal rekenen; enkel wat je léést, schuift mee.
 */
export function clockHourOfCell(cell: number): number {
  return (DAG_START_UUR + cell) % 24;
}

/** Ligt dit vakje al na middernacht, en dus op de kalenderdag erna? */
export function isAfterMidnight(cell: number): boolean {
  return DAG_START_UUR + cell >= 24;
}

/**
 * Hoe graag iemand op dat moment rijdt. Dezelfde drie waarden als de enum
 * `UitleenAvailabilityKind`; hier als union, want dit bestand mag geen Prisma
 * importeren (het draait ook in de browser).
 */
export type AvailabilityKind = 'JA' | 'LIEVER_NIET' | 'NOOD';

export const AVAILABILITY_KINDS: AvailabilityKind[] = ['JA', 'LIEVER_NIET', 'NOOD'];

export function isAvailabilityKind(value: unknown): value is AvailabilityKind {
  return typeof value === 'string' && (AVAILABILITY_KINDS as string[]).includes(value);
}

/**
 * Welke soort wint wanneer twee vensters hetzelfde uur claimen.
 *
 * Hoort in principe niet voor te komen (een dag wordt in haar geheel
 * herschreven, en een nieuw venster snijdt de andere soorten weg), maar oude
 * rijen van voor deze kolom kunnen elkaar wel overlappen. Dan wint het gulste
 * antwoord: iemand die ooit "ja" zei voor dat uur, is niet minder beschikbaar
 * geworden doordat er later een breed "in noodgeval" overheen kwam.
 */
const KIND_STRENGTH: Record<AvailabilityKind, number> = { JA: 3, LIEVER_NIET: 2, NOOD: 1 };

export function strongestKind(a: AvailabilityKind, b: AvailabilityKind): AvailabilityKind {
  return KIND_STRENGTH[a] >= KIND_STRENGTH[b] ? a : b;
}

export type Range = {
  startAt: Date;
  endAt: Date;
  kind: AvailabilityKind;
  /**
   * De nota bij dit venster, waar die meereist. Weggelaten waar ze er niet toe
   * doet (het intekenraster op een telefoon kent geen nota's).
   */
  note?: string | null;
};

/**
 * Aaneensluitende of overlappende bereiken van **dezelfde soort** samenvoegen.
 *
 * `<=` en niet `<`: twee vensters die op elkaar aansluiten (12:00-14:00 en
 * 14:00-18:00) zijn één blok van 12 tot 18. Als twee losse banden zien ze eruit
 * als een gaatje dat er niet is; dezelfde regel als in `addAvailabilityAction`.
 *
 * Per soort en niet over de soorten heen: "beschikbaar tot 14:00, liever niet
 * tot 18:00" zijn twee antwoorden. Samengevoegd tot één blok verdwijnt precies
 * het onderscheid waarvoor die soorten bestaan.
 */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const out: Range[] = [];
  for (const kind of AVAILABILITY_KINDS) {
    const sorted = ranges
      .filter((range) => range.kind === kind && range.endAt.getTime() > range.startAt.getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (const range of sorted) {
      const last = out[out.length - 1];
      if (last && last.kind === kind && range.startAt.getTime() <= last.endAt.getTime()) {
        if (range.endAt.getTime() > last.endAt.getTime()) last.endAt = new Date(range.endAt);
        // De eerste nota blijft, zoals bij `addAvailabilityAction`: samenvoegen
        // mag "enkel met de auto" niet stil laten verdwijnen.
        if (!last.note && range.note) last.note = range.note;
        continue;
      }
      out.push({
        startAt: new Date(range.startAt),
        endAt: new Date(range.endAt),
        kind,
        ...(range.note ? { note: range.note } : {}),
      });
    }
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * Wat er van een venster overblijft buiten een ander tijdvenster.
 *
 * Nul, één of twee stukken: knip je het midden eruit, dan blijven de twee
 * uiteinden staan. De soort blijft die van het oorspronkelijke venster.
 */
export function subtractRange(range: Range, from: Date, to: Date): Range[] {
  const out: Range[] = [];
  const note = range.note ? { note: range.note } : {};
  if (range.startAt.getTime() < from.getTime()) {
    out.push({
      startAt: new Date(range.startAt),
      endAt: new Date(Math.min(range.endAt.getTime(), from.getTime())),
      kind: range.kind,
      ...note,
    });
  }
  if (range.endAt.getTime() > to.getTime()) {
    out.push({
      startAt: new Date(Math.max(range.startAt.getTime(), to.getTime())),
      endAt: new Date(range.endAt),
      kind: range.kind,
      ...note,
    });
  }
  return out.filter((piece) => piece.endAt.getTime() > piece.startAt.getTime());
}

/**
 * Wat er van een venster overblijft buiten één dag.
 *
 * Een venster van vrijdagavond tot zondagochtend waarvan je zaterdag
 * herschrijft, houdt een stuk vrijdag én een stuk zondag over. Zonder deze
 * splitsing wist het intekenen van één dag stil de dagen ernaast.
 */
export function clipOutsideDay(range: Range, dayStart: Date, dayEnd: Date): Range[] {
  return subtractRange(range, dayStart, dayEnd);
}

/** Eén aangeduid uurvakje: het hoeveelste uur van de dag, en welke soort. */
export type HourCell = { hour: number; kind: AvailabilityKind };

/**
 * Aangevinkte uurvakjes omzetten naar bereiken.
 *
 * `hours` zijn uren sinds het begin van deze dag (0 tot en met 23), in gelijk
 * welke volgorde. Opeenvolgende uren **van dezelfde soort** worden één bereik:
 * acht losse vakjes van 09 tot 17 zijn één venster van 09:00 tot 17:00, en niet
 * acht vensters van een uur waar het beheer zich een weg doorheen moet lezen.
 * Slaat de soort om, dan begint er een nieuw venster; anders zou "tot 14:00 ja,
 * daarna liever niet" één onleesbaar blok worden.
 *
 * `dayStart` is dat begin als tijdstip, en dat is niet middernacht maar 05:00;
 * de aanroeper rekent het om met `availabilityDayBounds`. Uur 21 op zaterdag is
 * dus zondagochtend 02:00, en dat is precies de bedoeling.
 */
export function hoursToRanges(hours: readonly HourCell[], dayStart: Date): Range[] {
  // Per uur hoogstens één soort; komt hetzelfde uur twee keer voor, dan wint de
  // gulste (dat kan enkel bij rommelige invoer, maar stil de laatste nemen zou
  // van de volgorde afhangen).
  const perHour = new Map<number, AvailabilityKind>();
  for (const cell of hours) {
    if (!Number.isInteger(cell.hour) || cell.hour < 0 || cell.hour > 23) continue;
    if (!isAvailabilityKind(cell.kind)) continue;
    const existing = perHour.get(cell.hour);
    perHour.set(cell.hour, existing ? strongestKind(existing, cell.kind) : cell.kind);
  }

  const sorted = [...perHour.keys()].sort((a, b) => a - b);
  const out: Range[] = [];

  for (const hour of sorted) {
    const kind = perHour.get(hour) as AvailabilityKind;
    const last = out[out.length - 1];
    const start = new Date(dayStart.getTime() + hour * HOUR_MS);
    const end = new Date(start.getTime() + HOUR_MS);
    if (last && last.kind === kind && last.endAt.getTime() === start.getTime()) {
      last.endAt = end;
      continue;
    }
    out.push({ startAt: start, endAt: end, kind });
  }
  return out;
}

/**
 * De uren die een venster raakt op deze dag, om de vakjes mee te vullen.
 *
 * Een venster van 09:15 tot 12:00 kleurt op een dag die om 05:00 begint de
 * vakjes 4, 5 en 6: het vakje is een uur breed, en half kleuren bestaat niet.
 * Dat is ook waarom het intekenen op een telefoon per uur gaat en niet per
 * kwartier; met de vinger mik je geen kwartier.
 */
export function rangeToHours(
  range: { startAt: Date; endAt: Date },
  dayStart: Date,
  dayEnd: Date
): number[] {
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

/**
 * De uurvakjes van één dag, uit de opgeslagen vensters.
 *
 * Wat het intekenraster tekent, en wat het bij het opslaan terugstuurt. Het
 * gulste antwoord wint bij overlap; zie `strongestKind`.
 */
export function cellsForDay(
  windows: readonly { startAt: Date; endAt: Date; kind: AvailabilityKind }[],
  dayStart: Date,
  dayEnd: Date
): Map<number, AvailabilityKind> {
  const out = new Map<number, AvailabilityKind>();
  for (const window of windows) {
    for (const hour of rangeToHours(window, dayStart, dayEnd)) {
      const existing = out.get(hour);
      out.set(hour, existing ? strongestKind(existing, window.kind) : window.kind);
    }
  }
  return out;
}

/**
 * Het begin en het einde van een intekenweek: maandag 05:00 tot maandag 05:00.
 *
 * Dezelfde verschoven dagrand als `availabilityDayBounds`, want de nacht van
 * zondag op maandag hoort bij zondag en dus nog bij deze week.
 */
export function availabilityWeekBounds(mondayAsUtcMidnight: Date): {
  weekStart: Date;
  weekEnd: Date;
} {
  return {
    weekStart: availabilityDayBounds(mondayAsUtcMidnight).dayStart,
    weekEnd: availabilityDayBounds(new Date(mondayAsUtcMidnight.getTime() + 7 * DAY_MS)).dayStart,
  };
}

/**
 * Hetzelfde uur op de klok, een aantal weken verder.
 *
 * Niet `+ 7 * 24 uur`: over een zomeruurwissel heen schuift dat een uur op, en
 * dan wordt "dinsdag 18:00 tot 22:00" van vorige week deze week "19:00 tot
 * 23:00". Vensters zijn uren op de klok, dus de klok blijft staan.
 */
export function shiftWeeks(moment: Date, weeks: number): Date {
  const shift = weeks * 7 * DAY_MS;
  const wall = moment.getTime() + brusselsOffsetMs(moment) + shift;
  // Twee keer, zoals `startOfBrusselsDay`: de eerste gok gebruikt de offset van
  // het verkeerde moment wanneer de wissel tussen beide in valt.
  const first = wall - brusselsOffsetMs(new Date(moment.getTime() + shift));
  return new Date(wall - brusselsOffsetMs(new Date(first)));
}

/**
 * Wat er tussen `from` en `to` staat vervangen door `wanted`, en de rest laten.
 *
 * `existing` zijn de vensters die dat stuk nu raken. Wat ervan buiten het stuk
 * valt, blijft; wat erbinnen valt, gaat weg. `wanted` wordt op het stuk
 * geknipt, en daarna smelten aansluitende vensters van dezelfde soort samen.
 *
 * Twee dingen gebruiken dit: een week overnemen (`wanted` is vorige week, een
 * week opgeschoven) en een wijziging ongedaan maken (`wanted` is hoe het stuk
 * er voordien uitzag). Bij dat tweede is het knippen de hele truc: voegde de
 * server je venster samen met dat ernaast, dan komt dat stuk ernaast buiten het
 * bereik terug zoals het was, en sluit het weer aan op wat erbinnen terugkomt.
 */
export function replaceRange(
  existing: readonly Range[],
  wanted: readonly Range[],
  from: Date,
  to: Date
): Range[] {
  const outside = existing.flatMap((range) => subtractRange(range, from, to));
  const inside = wanted
    .map((range) => ({
      ...range,
      startAt: new Date(Math.max(range.startAt.getTime(), from.getTime())),
      endAt: new Date(Math.min(range.endAt.getTime(), to.getTime())),
    }))
    .filter((range) => isAvailabilityKind(range.kind));
  return mergeRanges([...outside, ...inside]);
}
