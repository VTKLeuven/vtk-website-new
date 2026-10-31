/**
 * Het shiftenoverzicht van Theokot (/admin/theokot/shiften): per dag van één
 * werkweek een tijdlijn met de shiften als balken, zodat Theokot ziet op welke
 * dagen en uren er nog shifters nodig zijn.
 *
 * Puur en zonder server-imports: de pagina rekent hier het hele raster uit en
 * geeft het als getallen en tekst aan de client, die enkel nog de aangeklikte
 * shift bijhoudt. Zie docs/design-decisions.md, "Theokot: shiftenoverzicht".
 */

import { brusselsMinutesOfDay, brusselsYMD, isoWeekday, shiftYMD, ymdKey, type YMD } from '@/lib/brussels';

/** Theokot verkoopt van maandag tot vrijdag; het weekend staat nooit op het scherm. */
export const THEOKOT_WEEKDAYS = 5;

export type TheokotShiftInput = {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  maxParticipants: number;
  /** Namen in volgorde van inschrijven. */
  participants: string[];
};

/** Een vaste shift uit het sjabloon, in minuten sinds middernacht. */
export type TheokotSlot = { startMinutes: number; endMinutes: number };

export type ShiftFill = 'full' | 'partial' | 'empty';

export type TimelineBar = {
  id: string;
  name: string;
  /** "HH:mm" op de Brusselse klok. */
  start: string;
  end: string;
  /** Positie en breedte op de tijdas, in procent. */
  left: number;
  width: number;
  /** Rij binnen de dag; enkel groter dan 0 wanneer shiften overlappen. */
  lane: number;
  fill: ShiftFill;
  filled: number;
  max: number;
  open: number;
  /** Afgelopen: telt niet meer mee in wat er nog nodig is. */
  past: boolean;
  participants: string[];
};

export type TimelineGhost = { start: string; end: string; left: number; width: number };

export type TimelineDay = {
  /** `yyyy-mm-dd`. */
  key: string;
  bars: TimelineBar[];
  /** Vaste shiften uit het sjabloon die er die dag niet zijn. */
  ghosts: TimelineGhost[];
  lanes: number;
  /** Open plaatsen in de shiften die nog moeten komen. */
  open: number;
  /** Heeft deze dag nog een shift die niet voorbij is? */
  upcoming: boolean;
  /** Nog een komende shift zonder één inschrijving. */
  hasEmpty: boolean;
  /** Positie van de gele nu-lijn in procent, enkel vandaag en binnen de as. */
  nowLeft: number | null;
};

export type TheokotTimeline = {
  fromMinutes: number;
  toMinutes: number;
  hours: { label: string; left: number }[];
  days: TimelineDay[];
  /** Over de shiften die nog moeten komen. */
  upcomingShifts: number;
  upcomingOpenShifts: number;
  upcomingOpen: number;
  totalShifts: number;
};

/** De maandag van de week waar `ymd` in valt. */
export function mondayOf(ymd: YMD): YMD {
  return shiftYMD(ymd, 1 - isoWeekday(ymd));
}

/**
 * De week waarop het scherm opent: deze week, en in het weekend de volgende.
 * Op zaterdag is er van deze week niets meer te regelen.
 */
export function defaultTheokotWeek(now: Date): YMD {
  const today = brusselsYMD(now);
  const monday = mondayOf(today);
  return isoWeekday(today) >= 6 ? shiftYMD(monday, 7) : monday;
}

/** De vijf werkdagen vanaf een maandag. */
export function weekdaysOf(monday: YMD): YMD[] {
  return Array.from({ length: THEOKOT_WEEKDAYS }, (_, index) => shiftYMD(monday, index));
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function shiftFill(filled: number, max: number): ShiftFill {
  if (filled >= max) return 'full';
  return filled === 0 ? 'empty' : 'partial';
}

/** Overlappende shiften naast elkaar in plaats van over elkaar: eerste vrije rij. */
function assignLanes<T extends { startMinutes: number; endMinutes: number }>(items: T[]): number[] {
  const laneEnds: number[] = [];
  return items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMinutes);
    } else {
      laneEnds[lane] = item.endMinutes;
    }
    return lane;
  });
}

/**
 * Het raster van één week. `slots` zijn de vaste shiften uit het sjabloon: een
 * vaste shift waar die dag geen enkele shift mee overlapt, verschijnt als "geen
 * shift". Overlap en niet een gelijk uur, zodat een dag die een halfuur later
 * opent er niet uitziet alsof alles ontbreekt. Een dag zonder één shift krijgt
 * geen spookshiften: daar is Theokot gewoon dicht.
 */
export function buildTheokotTimeline({
  monday,
  shifts,
  slots,
  now,
}: {
  monday: YMD;
  shifts: TheokotShiftInput[];
  slots: TheokotSlot[];
  now: Date;
}): TheokotTimeline {
  const days = weekdaysOf(monday);
  const keys = days.map(ymdKey);
  const todayKey = ymdKey(brusselsYMD(now));
  const nowMinutes = brusselsMinutesOfDay(now);

  const placed = shifts
    .map((shift) => ({
      shift,
      key: ymdKey(brusselsYMD(shift.startTime)),
      startMinutes: brusselsMinutesOfDay(shift.startTime),
      // Een shift die over middernacht loopt, bestaat bij Theokot niet; knip ze
      // af op het einde van de dag in plaats van de as tot 's nachts te rekken.
      endMinutes:
        ymdKey(brusselsYMD(shift.endTime)) === ymdKey(brusselsYMD(shift.startTime))
          ? brusselsMinutesOfDay(shift.endTime)
          : 24 * 60,
    }))
    .filter((item) => keys.includes(item.key))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  const starts = [...placed.map((item) => item.startMinutes), ...slots.map((slot) => slot.startMinutes)];
  const ends = [...placed.map((item) => item.endMinutes), ...slots.map((slot) => slot.endMinutes)];
  const fromMinutes = starts.length > 0 ? Math.floor(Math.min(...starts) / 60) * 60 : 10 * 60;
  const toMinutes = ends.length > 0 ? Math.max(fromMinutes + 60, Math.ceil(Math.max(...ends) / 60) * 60) : 16 * 60;
  const span = toMinutes - fromMinutes;
  const pct = (minutes: number) => ((minutes - fromMinutes) / span) * 100;

  const hours: TheokotTimeline['hours'] = [];
  for (let minutes = fromMinutes; minutes <= toMinutes; minutes += 60) {
    hours.push({ label: hhmm(minutes), left: pct(minutes) });
  }

  let upcomingShifts = 0;
  let upcomingOpenShifts = 0;
  let upcomingOpen = 0;

  const timelineDays = keys.map((key): TimelineDay => {
    const items = placed.filter((item) => item.key === key);
    const lanes = assignLanes(items);
    const bars = items.map((item, index): TimelineBar => {
      const filled = item.shift.participants.length;
      const max = item.shift.maxParticipants;
      const open = Math.max(0, max - filled);
      const past = item.shift.endTime.getTime() <= now.getTime();
      if (!past) {
        upcomingShifts += 1;
        if (open > 0) upcomingOpenShifts += 1;
        upcomingOpen += open;
      }
      return {
        id: item.shift.id,
        name: item.shift.name,
        start: hhmm(item.startMinutes),
        end: hhmm(item.endMinutes),
        left: pct(item.startMinutes),
        width: pct(item.endMinutes) - pct(item.startMinutes),
        lane: lanes[index],
        fill: shiftFill(filled, max),
        filled,
        max,
        open,
        past,
        participants: item.shift.participants,
      };
    });
    const ghosts =
      items.length === 0
        ? []
        : slots
            .filter((slot) => !items.some((item) => item.startMinutes < slot.endMinutes && item.endMinutes > slot.startMinutes))
            .map((slot) => ({
              start: hhmm(slot.startMinutes),
              end: hhmm(slot.endMinutes),
              left: pct(slot.startMinutes),
              width: pct(slot.endMinutes) - pct(slot.startMinutes),
            }));
    const upcomingBars = bars.filter((bar) => !bar.past);
    return {
      key,
      bars,
      ghosts,
      lanes: Math.max(1, ...lanes.map((lane) => lane + 1)),
      open: upcomingBars.reduce((sum, bar) => sum + bar.open, 0),
      upcoming: upcomingBars.length > 0,
      hasEmpty: upcomingBars.some((bar) => bar.fill === 'empty'),
      nowLeft: key === todayKey && nowMinutes >= fromMinutes && nowMinutes <= toMinutes ? pct(nowMinutes) : null,
    };
  });

  return {
    fromMinutes,
    toMinutes,
    hours,
    days: timelineDays,
    upcomingShifts,
    upcomingOpenShifts,
    upcomingOpen,
    totalShifts: placed.length,
  };
}

/**
 * De shift die open staat wanneer het scherm laadt: de eerste komende shift
 * waar nog plaats is, anders de eerste komende, anders de eerste van de week.
 */
export function defaultSelectedShift(timeline: TheokotTimeline): string | null {
  const bars = timeline.days.flatMap((day) => day.bars);
  return (
    bars.find((bar) => !bar.past && bar.open > 0)?.id ??
    bars.find((bar) => !bar.past)?.id ??
    bars[0]?.id ??
    null
  );
}
