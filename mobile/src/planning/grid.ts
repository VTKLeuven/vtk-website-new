import type {
  AppPlanning,
  AppPlanningItem,
  AppPlanningOccurrence,
  AppPlanningSession,
  AppPlanningVtkEvent,
} from '../api/contract';

/**
 * Wat de planning van de app uit een `AppPlanning` berekent: welke dagen het
 * raster draagt, wat er op elke dag staat, en hoe blokken die overlappen naast
 * elkaar komen. Puur, zonder React, zodat het rekenwerk los te lezen is.
 *
 * Alle data zijn wandkloktijd in Leuven, zoals de server ze stuurt ("YYYY-MM-DD"
 * en minuten sinds middernacht). Er wordt hier dus nooit met tijdzones gerekend:
 * een dag is een string, en de volgende dag is die string plus één.
 */

export type Tone = 'lecture' | 'practice' | 'other';

export function toneOf(type: string): Tone {
  if (type === 'college') return 'lecture';
  if (type === 'practicum' || type === 'oefenzitting') return 'practice';
  return 'other';
}

export const TYPE_LABELS: Record<string, string> = {
  college: 'Hoorcollege',
  practicum: 'Practicum',
  oefenzitting: 'Oefenzitting',
  excursie: 'Excursie',
  opdracht: 'Opdracht',
  other: 'Sessie',
};

/** Waar een blok of een regel in de dagstrook vandaan komt; het detailblad leest dit. */
export type Ref =
  | { kind: 'session'; session: AppPlanningSession }
  | { kind: 'item'; item: AppPlanningItem }
  | { kind: 'vtk'; event: AppPlanningVtkEvent; occurrence: AppPlanningOccurrence };

/** Een blok in het tijdsraster. */
export type Block = {
  key: string;
  startMin: number;
  endMin: number;
  /** Het uur zoals het boven het blok staat; bij een voortzetting na middernacht leeg. */
  time: string;
  title: string;
  place: string | null;
  tone: Tone | 'vtk';
  mandatory: boolean;
  done: boolean;
  hidden: boolean;
  ref: Ref;
};

/** Een regel in de strook bovenaan een dag: een deadline, of iets dat de hele dag duurt. */
export type Chip = { key: string; label: string; vtk: boolean; done: boolean; ref: Ref };

export type Placed = Block & { lane: number; lanes: number };

// ── Data als strings ────────────────────────────────────────────────────────

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

/** De dag `n` dagen na `date`. In UTC gerekend: dan bestaat er geen zomeruur. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** 0 = maandag ... 6 = zondag. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parts(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** ISO-weeknummer, zoals de week op de site en op Burgieclan heet. */
export function isoWeek(date: string): number {
  const thursday = addDays(date, 3 - weekdayOf(date));
  const [y] = parts(thursday);
  return Math.floor(daysBetween(`${y}-01-01`, thursday) / 7) + 1;
}

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

export function weekdayShort(date: string): string {
  return WEEKDAYS[weekdayOf(date)];
}

export function dayNumber(date: string): number {
  return parts(date)[2];
}

/** "di 24 nov". */
export function shortDay(date: string): string {
  const [, m, d] = parts(date);
  return `${weekdayShort(date)} ${d} ${MONTHS[m - 1]}`;
}

/** "november 2026", of "nov - dec 2026" wanneer de zichtbare dagen over een maand lopen. */
export function monthSpan(first: string, last: string): string {
  const [y1, m1] = parts(first);
  const [y2, m2] = parts(last);
  if (m1 === m2 && y1 === y2) return `${MONTHS_LONG[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${MONTHS[m1 - 1]} - ${MONTHS[m2 - 1]} ${y1}`;
  return `${MONTHS[m1 - 1]} ${y1} - ${MONTHS[m2 - 1]} ${y2}`;
}

const minutesOf = (time: string | null): number | null => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// ── Het raster ──────────────────────────────────────────────────────────────

/**
 * De dagen van het raster: vier weken terug (wat moet ik nog inhalen) tot een
 * week na het laatste dat erin staat, en minstens vier maanden vooruit. Niet
 * eindeloos: het is een horizontale lijst, en elke dag is een kolom.
 */
export function dayRange(planning: AppPlanning): string[] {
  const today = planning.today || new Date().toISOString().slice(0, 10);
  const first = mondayOf(addDays(today, -28));
  let last = addDays(today, 120);
  const dates = [
    ...planning.sessions.map((s) => s.date),
    ...planning.items.map((i) => i.date),
    ...planning.vtkEvents.flatMap((v) => v.occurrences.map((o) => o.endDate)),
  ];
  for (const date of dates) if (date > last) last = date;
  const cap = addDays(today, 365);
  if (last > cap) last = cap;
  last = addDays(last, 7);
  const count = daysBetween(first, last) + 1;
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

export type DayContent = { blocks: Block[]; chips: Chip[] };

/** Wat er op elke dag staat. Verborgen lessen enkel met `showHidden`. */
export function contentByDay(planning: AppPlanning, showHidden: boolean): Map<string, DayContent> {
  const days = new Map<string, DayContent>();
  const day = (date: string) => {
    let content = days.get(date);
    if (!content) {
      content = { blocks: [], chips: [] };
      days.set(date, content);
    }
    return content;
  };

  for (const session of planning.sessions) {
    const hidden = session.hidden !== null;
    if (hidden && !showHidden) continue;
    day(session.date).blocks.push({
      key: `s:${session.uid}`,
      startMin: session.startMin,
      endMin: session.endMin,
      time: session.start,
      title: session.course,
      place: session.location,
      tone: toneOf(session.type),
      mandatory: session.mandatory !== null,
      done: session.done,
      hidden,
      ref: { kind: 'session', session },
    });
  }

  for (const item of planning.items) {
    const start = minutesOf(item.time);
    const ref: Ref = { kind: 'item', item };
    if (item.kind === 'mandatory' && start !== null) {
      const end = minutesOf(item.end);
      day(item.date).blocks.push({
        key: `i:${item.id}`,
        startMin: start,
        endMin: Math.min(1440, end !== null && end > start ? end : start + 60),
        time: item.time ?? '',
        title: item.title,
        place: item.subjectLabel,
        tone: 'other',
        mandatory: true,
        done: item.done,
        hidden: false,
        ref,
      });
    } else {
      const prefix = item.kind === 'deadline' ? 'Deadline' : 'Verplicht';
      day(item.date).chips.push({
        key: `i:${item.id}`,
        label: `${item.time ? `${item.time} ` : ''}${prefix}: ${item.title}`,
        vtk: false,
        done: item.done,
        ref,
      });
    }
  }

  for (const event of planning.vtkEvents) {
    for (const occurrence of event.occurrences) {
      const ref: Ref = { kind: 'vtk', event, occurrence };
      const title = occurrence.label ? `${event.title}: ${occurrence.label}` : event.title;
      const span = Math.max(0, daysBetween(occurrence.date, occurrence.endDate));
      if (occurrence.allDay) {
        for (let i = 0; i <= span; i++) {
          day(addDays(occurrence.date, i)).chips.push({
            key: `v:${occurrence.key}:${i}`,
            label: title,
            vtk: true,
            done: false,
            ref,
          });
        }
        continue;
      }
      const block = {
        title,
        place: occurrence.location,
        tone: 'vtk' as const,
        mandatory: false,
        done: false,
        hidden: false,
        ref,
      };
      day(occurrence.date).blocks.push({
        ...block,
        key: `v:${occurrence.key}`,
        startMin: occurrence.startMin,
        endMin: occurrence.endMin,
        time: occurrence.start ?? '',
      });
      // Een avond die na middernacht doorloopt, staat ook op de volgende dag:
      // wie om half twee nog op een cantus staat, ziet dat in die kolom.
      const endMin = minutesOf(occurrence.end) ?? 0;
      for (let i = 1; i <= span; i++) {
        const last = i === span;
        if (last && endMin === 0) break;
        day(addDays(occurrence.date, i)).blocks.push({
          ...block,
          key: `v:${occurrence.key}:${i}`,
          startMin: 0,
          endMin: last ? Math.max(endMin, 15) : 1440,
          time: '',
        });
      }
    }
  }

  return days;
}

/** Naast elkaar wat tegelijk valt, zoals de weekweergave op Burgieclan. */
export function place(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const block of sorted) {
    if (cluster.length > 0 && block.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    cluster.push({ ...block, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  flush();
  return out;
}
