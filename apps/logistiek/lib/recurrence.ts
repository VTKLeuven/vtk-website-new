/**
 * De data van een herhaalde rit (F6.22): C&G-ritten, het containerpark, de BO-rit.
 *
 * Puur en zonder databank, zoals `week-lanes.ts`: het is een handvol randgevallen
 * (een maand zonder 31ste, "de laatste vrijdag", een rit over middernacht) waar
 * niets zichtbaar misgaat als het fout staat, en dan wil je er tests op.
 *
 * **Het rekent met Brusselse klokstrings (`YYYY-MM-DDTHH:mm`) en niet met
 * tijdstippen.** Een wekelijkse rit om 18:00 blijft 18:00 over de zomertijdwissel
 * heen; "plus zevenmaal 24 uur" verschuift ze een uur zodra de klok verspringt.
 * De klok wordt pas een tijdstip wanneer `buildTransportBookings` elke
 * herhaling apart inleest, en die kent de Brusselse offset per datum.
 */

/** Meer dan een jaar aan wekelijkse ritten is een reeks die niemand overziet. */
export const MAX_SERIES_OCCURRENCES = 52;

/** Maandag is 0, zoals overal in deze module. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RecurrenceRule =
  /** Op gekozen weekdagen, elke `everyWeeks` weken (1 tot 4). */
  | { kind: 'WEEKLY'; weekdays: number[]; everyWeeks: number }
  /** Op dezelfde dag van de maand. Een maand zonder die dag valt over. */
  | { kind: 'MONTHLY_DATE' }
  /** Op dezelfde weekdag-plaats: de eerste maandag, de derde donderdag, de laatste vrijdag. */
  | { kind: 'MONTHLY_WEEKDAY' };

export type RecurrenceEnd =
  /** Tot en met deze datum (`YYYY-MM-DD`). */
  | { kind: 'UNTIL'; date: string }
  /** In totaal zoveel ritten, de eerste meegeteld. */
  | { kind: 'COUNT'; count: number };

export type LocalWindow = { startAt: string; endAt: string };

/** De korte weekdagnamen, maandag eerst (index = `WeekdayIndex`). */
export const WEEKDAY_SHORT_NL = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` naar UTC-middernacht: dagrekenen zonder een zomertijd om op te letten. */
function dayOf(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function addDays(day: Date, count: number): Date {
  return new Date(day.getTime() + count * DAY_MS);
}

/** Maandag is 0. */
function weekdayOf(day: Date): number {
  return (day.getUTCDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** De n-de weekdag van een maand; een vijfde is hier "de laatste". */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - weekdayOf(first) + 7) % 7;
  const lastDay = daysInMonth(year, month);
  if (nth >= 5) {
    // De laatste: begin bij de vierde en schuif nog een week op zolang het in de maand valt.
    let day = 1 + offset + 21;
    if (day + 7 <= lastDay) day += 7;
    return new Date(Date.UTC(year, month, day));
  }
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

/**
 * Alle ritten van de reeks, de eerste inbegrepen, op volgorde.
 *
 * De eerste is altijd de rit zoals het team ze intikte, ook als ze niet op een
 * van de gekozen weekdagen valt: wie begint op een woensdag en "maandag" kiest,
 * wil dat de woensdag erbij staat en niet stil verdwijnt.
 *
 * Een rit over middernacht blijft over middernacht: het einde ligt even ver
 * achter het begin in dagen en houdt zijn eigen uur.
 */
export function seriesOccurrences(
  first: LocalWindow,
  rule: RecurrenceRule,
  end: RecurrenceEnd
): LocalWindow[] {
  const [startDate, startTime] = first.startAt.split('T');
  const [endDate, endTime] = first.endAt.split('T');
  if (!startDate || !startTime || !endDate || !endTime) return [];

  const origin = dayOf(startDate);
  const spanDays = Math.round((dayOf(endDate).getTime() - origin.getTime()) / DAY_MS);

  const limit =
    end.kind === 'COUNT'
      ? Math.max(1, Math.min(MAX_SERIES_OCCURRENCES, Math.trunc(end.count)))
      : MAX_SERIES_OCCURRENCES;
  const until = end.kind === 'UNTIL' ? dayOf(end.date) : null;

  const days: Date[] = [origin];
  const wanted = (day: Date) => day.getTime() > origin.getTime() && (!until || day <= until);
  const full = () => days.length >= limit;

  if (rule.kind === 'WEEKLY') {
    const everyWeeks = Math.min(4, Math.max(1, Math.trunc(rule.everyWeeks) || 1));
    // Enkel de gekozen weekdagen; zonder keuze de weekdag van de eerste rit. De
    // eerste rit zelf staat er sowieso, ook als haar weekdag niet gekozen is.
    const chosen = [...new Set(rule.weekdays)]
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    const weekdays = chosen.length > 0 ? chosen : [weekdayOf(origin)];
    const monday = addDays(origin, -weekdayOf(origin));
    // Een bovengrens op het aantal weken: met "tot" kan de einddatum jaren ver liggen.
    for (let week = 0; week <= MAX_SERIES_OCCURRENCES * 4 && !full(); week += everyWeeks) {
      for (const weekday of weekdays) {
        const day = addDays(monday, week * 7 + weekday);
        if (wanted(day) && !full()) days.push(day);
      }
      if (until && addDays(monday, week * 7) > until) break;
    }
  } else {
    const originDay = origin.getUTCDate();
    const nth = Math.floor((originDay - 1) / 7) + 1;
    for (let month = 1; month <= 120 && !full(); month += 1) {
      const target = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + month, 1));
      const year = target.getUTCFullYear();
      const monthIndex = target.getUTCMonth();
      let day: Date | null;
      if (rule.kind === 'MONTHLY_DATE') {
        // Zonder die dag (de 31ste in een korte maand) valt de maand over, in
        // plaats van op de laatste dag te landen: een rit die stilletjes een dag
        // verspringt, is erger dan een maand zonder rit.
        day = originDay <= daysInMonth(year, monthIndex) ? new Date(Date.UTC(year, monthIndex, originDay)) : null;
      } else {
        day = nthWeekdayOfMonth(year, monthIndex, weekdayOf(origin), nth);
      }
      if (day && until && day > until) break;
      if (day && wanted(day)) days.push(day);
    }
  }

  return days
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, limit)
    .map((day) => ({
      startAt: `${isoDate(day)}T${startTime}`,
      endAt: `${isoDate(addDays(day, spanDays))}T${endTime}`,
    }));
}

// ---------------------------------------------------------------------------
// Het formulier (client-veilig: geen databank, geen server-only)
// ---------------------------------------------------------------------------

/** Wat het team in het formulier invult, voor het een regel wordt. */
export type RepeatDraft = {
  on: boolean;
  pattern: RecurrenceRule['kind'];
  /** Maandag is 0. */
  weekdays: number[];
  everyWeeks: number;
  endKind: RecurrenceEnd['kind'];
  /** `YYYY-MM-DD`; leeg zolang het niet gekozen is. */
  until: string;
  count: number;
};

/** De weekdag van een `YYYY-MM-DDTHH:mm`-klokstring, maandag is 0. */
export function weekdayOfLocal(startAt: string): number | null {
  const date = startAt.split('T')[0];
  if (!date || Number.isNaN(dayOf(date).getTime())) return null;
  return weekdayOf(dayOf(date));
}

export function defaultRepeatDraft(startAt: string): RepeatDraft {
  const weekday = weekdayOfLocal(startAt);
  return {
    on: false,
    pattern: 'WEEKLY',
    weekdays: weekday === null ? [] : [weekday],
    everyWeeks: 1,
    endKind: 'COUNT',
    until: '',
    count: 8,
  };
}

/** De regel en het einde uit het formulier, of `null` wanneer er niet herhaald wordt. */
export function repeatFromDraft(
  draft: RepeatDraft
): { rule: RecurrenceRule; end: RecurrenceEnd } | null {
  if (!draft.on) return null;
  const rule: RecurrenceRule =
    draft.pattern === 'WEEKLY'
      ? { kind: 'WEEKLY', weekdays: draft.weekdays, everyWeeks: draft.everyWeeks }
      : { kind: draft.pattern };
  const end: RecurrenceEnd =
    draft.endKind === 'UNTIL' && draft.until
      ? { kind: 'UNTIL', date: draft.until }
      : { kind: 'COUNT', count: draft.count };
  return { rule, end };
}
