'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { Button, Card, ConfirmDialog, Input, Label, Select, Textarea } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import { IconButton } from '@/components/ui/IconButton';
import { TrashIcon } from '@/components/ui/icons';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  composeName,
  templateTimeOfDay,
  templateClockAt,
  getCurrentMonday,
  getNextMonday,
  addDaysToYmd,
  getDatesBetween,
  formatDayLabel,
  type ShiftTemplate,
} from '@/lib/shift/templates';

// -----------------------------------------------------------------------------
// Reken- en formatteerhulpjes.
//
// Alle tijden zijn wandkloktijden ("YYYY-MM-DDTHH:mm", zoals een datetime-local
// input) en de server leest ze als Belgische tijd. Date.UTC houdt de zomertijd
// van de browser erbuiten.
// -----------------------------------------------------------------------------

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const pad = (n: number) => String(n).padStart(2, '0');

function toParts(value: string): Date | null {
  const m = LOCAL.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
}

function fromParts(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** `local` plus `minutes`, opnieuw als "YYYY-MM-DDTHH:mm". Leeg blijft leeg. */
function addMinutes(local: string, minutes: number): string {
  const parsed = toParts(local);
  if (!parsed) return '';
  return fromParts(new Date(parsed.getTime() + minutes * 60_000));
}

/** Aantal minuten tussen twee wandkloktijden, of null als er één ontbreekt. */
function minutesBetween(from: string, to: string): number | null {
  const a = toParts(from);
  const b = toParts(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** "2 u 30" / "45 min", voor het lijntje naast elke shift. */
function formatDuration(minutes: number, nl: boolean): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return nl ? `${hours} u` : `${hours}h`;
  return nl ? `${hours} u ${pad(rest)}` : `${hours}h${pad(rest)}`;
}

/** Compacte weergave van een wandkloktijd: "vr 12/09 20:00". */
function formatMoment(local: string, locale: Locale): string {
  const parsed = toParts(local);
  if (!parsed) return '—';
  const day = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
  return `${day} ${local.slice(11, 16)}`;
}

function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function formatDayTitle(dateStr: string, locale: Locale): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(dt);
}

/**
 * Startmoment waarmee het scherm opent: de dag die de server meegeeft, op het uur
 * dat het sjabloon voorstelt.
 */
function defaultStart(template: ShiftTemplate | null, today: string): string {
  return `${today}T${template ? templateTimeOfDay(template) : '12:00'}`;
}

const WEEKDAYS = [
  { id: 1, nl: 'Ma', en: 'Mon' },
  { id: 2, nl: 'Di', en: 'Tue' },
  { id: 3, nl: 'Wo', en: 'Wed' },
  { id: 4, nl: 'Do', en: 'Thu' },
  { id: 5, nl: 'Vr', en: 'Fri' },
  { id: 6, nl: 'Za', en: 'Sat' },
  { id: 0, nl: 'Zo', en: 'Sun' },
];

// -----------------------------------------------------------------------------
// De werkkopie: globale velden + één rij per shift.
// -----------------------------------------------------------------------------

export type BuilderMode = 'single' | 'recurring';

type Globals = {
  eventName: string;
  start: string;
  location: string;
  post: string;
};

type Row = {
  uid: string;
  enabled: boolean;
  name: string;
  start: string;
  end: string;
  maxParticipants: string;
  reward: string;
  location: string;
  post: string;
  description: string;
  instructions: string;
  openToInternationals: boolean;
  offsetMinutes: number;
  durationMinutes: number;
  baseName: string;
  ownLocation: boolean;
  ownPost: boolean;
  touched: { name?: boolean; time?: boolean; location?: boolean; post?: boolean };
};

type PreparedShift = {
  key: string;
  date: string;
  name: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  maxParticipants: number;
  reward: number;
  post: string | null;
  openToInternationals: boolean;
  instructions: string | null;
};

const MAX_SHIFTS_PER_RUN = 100;
/** Langer dan een jaar is bijna zeker een tikfout in het jaartal. */
const MAX_RANGE_DAYS = 366;

function toShiftBody(shift: PreparedShift) {
  return {
    name: shift.name.trim(),
    startTime: shift.startTime,
    endTime: shift.endTime,
    location: shift.location.trim(),
    description: shift.description.trim(),
    maxParticipants: shift.maxParticipants,
    reward: shift.reward,
    post: shift.post === '' ? null : shift.post,
    openToInternationals: shift.openToInternationals,
    instructions: shift.instructions?.trim() ? shift.instructions.trim() : null,
  };
}

async function describeFailure(resp: Response): Promise<string> {
  const data = (await resp.json().catch(() => null)) as
    | { error?: string; details?: string[] }
    | null;
  if (data?.details?.length) return data.details.join('; ');
  return data?.error ?? `HTTP ${resp.status}`;
}

function initialGlobals(template: ShiftTemplate | null, start: string, postOptions?: string[]): Globals {
  let defaultPost = template?.post ?? '';
  if (postOptions && postOptions.length > 0 && !postOptions.includes(defaultPost)) {
    defaultPost = postOptions[0];
  }
  return {
    eventName: template?.eventName ?? '',
    start,
    location: template?.location ?? '',
    post: defaultPost,
  };
}

function buildRows(template: ShiftTemplate | null, globals: Globals, postOptions?: string[]): Row[] {
  if (!template) {
    return [blankRow(globals)];
  }
  return template.shifts.map((entry, index) => {
    const ownPost = entry.ownPost && (entry.post === null || !postOptions?.length || postOptions.includes(entry.post));
    return {
      uid: `${template.id}-${entry.id}-${index}`,
      enabled: entry.enabled,
      name: composeName(globals.eventName, entry.name),
      start: addMinutes(globals.start, entry.startOffsetMinutes),
      end: addMinutes(globals.start, entry.startOffsetMinutes + entry.durationMinutes),
      maxParticipants: String(entry.maxParticipants),
      reward: String(entry.reward),
      location: entry.location ?? globals.location,
      post: ownPost ? (entry.post ?? '') : globals.post,
      description: entry.description,
      instructions: entry.instructions ?? '',
      openToInternationals: entry.openToInternationals,
      offsetMinutes: entry.startOffsetMinutes,
      durationMinutes: entry.durationMinutes,
      baseName: entry.name,
      ownLocation: entry.location !== null,
      ownPost,
      touched: {},
    };
  });
}

function blankRow(globals: Globals): Row {
  return {
    uid: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    name: composeName(globals.eventName, 'Extra shift'),
    start: globals.start,
    end: addMinutes(globals.start, 120),
    maxParticipants: '2',
    reward: '1',
    location: globals.location,
    post: globals.post,
    description: '',
    instructions: '',
    openToInternationals: false,
    offsetMinutes: 0,
    durationMinutes: 120,
    baseName: 'Extra shift',
    ownLocation: false,
    ownPost: false,
    touched: { name: true, time: true, location: true, post: true },
  };
}

/** Een korte lijst staat open; bij een lange enkel de eerste shift. */
function initiallyExpanded(rows: Row[]): Set<string> {
  return new Set(rows.length <= 3 ? rows.map((r) => r.uid) : rows.slice(0, 1).map((r) => r.uid));
}

// -----------------------------------------------------------------------------

export function ShiftTemplateBuilder({
  locale,
  templates,
  today,
  postOptions,
  allowNoPost,
}: {
  locale: Locale;
  templates: ShiftTemplate[];
  today: string;
  postOptions: string[];
  /** Enkel een superadmin mag een shift zonder post maken; de API weigert het anders. */
  allowNoPost: boolean;
}) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  const [mode, setMode] = useState<BuilderMode>('single');
  const [templateId, setTemplateId] = useState('');
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);

  const [globals, setGlobals] = useState<Globals>(() =>
    initialGlobals(template, defaultStart(template, today), postOptions),
  );
  const [rows, setRows] = useState<Row[]>(() =>
    buildRows(template, initialGlobals(template, defaultStart(template, today), postOptions), postOptions),
  );

  // Terugkerende / meerdere dagen modus instellingen
  const currentMon = useMemo(() => getCurrentMonday(today), [today]);
  const nextMon = useMemo(() => getNextMonday(today), [today]);
  // "Deze week" begint vandaag: een shift op een voorbije dag kan niemand nog opnemen.
  const thisWeekStart = today > currentMon ? today : currentMon;
  const thisWeekEnd = addDaysToYmd(currentMon, 4);
  const [startDate, setStartDate] = useState(nextMon);
  const [endDate, setEndDate] = useState(() => addDaysToYmd(nextMon, 4));
  const [recurringTime, setRecurringTime] = useState(() => (template ? templateTimeOfDay(template) : '12:00'));
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // Ma..Vr
  const [dayOverrides, setDayOverrides] = useState<
    Record<string, { enabled?: boolean; disabledShiftUids?: string[] }>
  >({});
  const [expandedUids, setExpandedUids] = useState<Set<string>>(() => initiallyExpanded(rows));
  const [collapsedDayDates, setCollapsedDayDates] = useState<Set<string>>(() => new Set());
  const [showPreviewTable, setShowPreviewTable] = useState(false);

  function toggleExpand(uid: string) {
    setExpandedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function toggleDayExpand(date: string) {
    setCollapsedDayDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function expandAll() {
    setExpandedUids(new Set(rows.map((r) => r.uid)));
  }

  function collapseAll() {
    setExpandedUids(new Set());
  }

  const [dirty, setDirty] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [doneUids, setDoneUids] = useState<string[]>([]);
  const showToast = useToast();
  const router = useRouter();
  const overview = `${base}/admin/shiften`;

  function touchForm() {
    setDirty(true);
  }

  function applyStart(current: Row[], start: string): Row[] {
    return current.map((row) =>
      row.touched.time
        ? // De rij blijft staan waar ze staat; haar afstand tot de nieuwe start
          // verandert dus, en de reeksmodus rekent met die afstand.
          { ...row, offsetMinutes: minutesBetween(start, row.start) ?? row.offsetMinutes }
        : {
            ...row,
            start: addMinutes(start, row.offsetMinutes),
            end: addMinutes(start, row.offsetMinutes + row.durationMinutes),
          }
    );
  }

  function setGlobal<K extends keyof Globals>(key: K, value: Globals[K]) {
    touchForm();
    setGlobals((cur) => ({ ...cur, [key]: value }));

    if (key === 'start') {
      setRows((cur) => applyStart(cur, value as string));
    } else if (key === 'eventName') {
      setRows((cur) =>
        cur.map((row) => (row.touched.name ? row : { ...row, name: composeName(value as string, row.baseName) }))
      );
    } else if (key === 'location') {
      setRows((cur) =>
        cur.map((row) => (row.touched.location || row.ownLocation ? row : { ...row, location: value as string }))
      );
    } else if (key === 'post') {
      setRows((cur) => cur.map((row) => (row.touched.post || row.ownPost ? row : { ...row, post: value as string })));
    }
  }

  function selectTemplate(id: string) {
    if (!id) {
      const day = globals.start.slice(0, 10) || today;
      const start = `${day}T12:00`;
      const nextGlobals = initialGlobals(null, start, postOptions);
      const newRows = buildRows(null, nextGlobals, postOptions);
      setTemplateId('');
      setGlobals(nextGlobals);
      setRows(newRows);
      setExpandedUids(initiallyExpanded(newRows));
      setRecurringTime('12:00');
      setDayOverrides({});
      setDirty(false);
      setFailure(null);
      setDoneUids([]);
      return;
    }
    const next = templates.find((t) => t.id === id);
    if (!next) return;
    const day = globals.start.slice(0, 10) || today;
    const start = defaultStart(next, day);
    const nextGlobals = initialGlobals(next, start, postOptions);
    const newRows = buildRows(next, nextGlobals, postOptions);
    setTemplateId(id);
    setGlobals(nextGlobals);
    setRows(newRows);
    setExpandedUids(initiallyExpanded(newRows));
    setRecurringTime(templateTimeOfDay(next));
    setDayOverrides({});
    setDirty(false);
    setFailure(null);
    setDoneUids([]);
  }

  function updateRow(uid: string, patch: Partial<Row>, touch?: keyof Row['touched']) {
    touchForm();
    setRows((cur) =>
      cur.map((row) =>
        row.uid === uid ? { ...row, ...patch, touched: touch ? { ...row.touched, [touch]: true } : row.touched } : row
      )
    );
  }

  function moveRowStart(row: Row, value: string) {
    updateRow(
      row.uid,
      {
        start: value,
        end: addMinutes(value, row.durationMinutes),
        offsetMinutes: minutesBetween(globals.start, value) ?? row.offsetMinutes,
      },
      'time',
    );
  }

  /** Een aanpassing in de reeksmodus: houd ook begin en einde van de enkele dag gelijk. */
  function setRowOffsetAndDuration(row: Row, offsetMinutes: number, durationMinutes: number) {
    const start = addMinutes(globals.start, offsetMinutes);
    updateRow(
      row.uid,
      { offsetMinutes, durationMinutes, start, end: addMinutes(start, durationMinutes) },
      'time',
    );
  }

  function moveRowEnd(row: Row, value: string) {
    const length = minutesBetween(row.start, value);
    updateRow(row.uid, { end: value, durationMinutes: length ?? row.durationMinutes }, 'time');
  }

  function removeRow(uid: string) {
    touchForm();
    setRows((cur) => cur.filter((row) => row.uid !== uid));
    setExpandedUids((cur) => {
      const next = new Set(cur);
      next.delete(uid);
      return next;
    });
  }

  // Dagen en tijden berekenen
  const targetDates = useMemo(() => {
    if (mode === 'single') return [];
    return getDatesBetween(startDate, endDate, activeWeekdays);
  }, [mode, startDate, endDate, activeWeekdays]);

  const enabledRows = useMemo(() => rows.filter((row) => row.enabled), [rows]);

  // Voorbereide shiften per modus
  const allPreparedShifts = useMemo((): PreparedShift[] => {
    if (mode === 'single') {
      return enabledRows.map((row) => ({
        key: row.uid,
        date: row.start.slice(0, 10),
        name: row.name,
        startTime: row.start,
        endTime: row.end,
        location: row.location,
        description: row.description,
        maxParticipants: Number(row.maxParticipants) || 1,
        reward: Number(row.reward) || 0,
        post: row.post === '' ? null : row.post,
        openToInternationals: row.openToInternationals,
        instructions: row.instructions,
      }));
    }

    const result: PreparedShift[] = [];
    for (const date of targetDates) {
      if (dayOverrides[date]?.enabled === false) continue;
      const disabledUids = new Set(dayOverrides[date]?.disabledShiftUids ?? []);
      const baseStart = `${date}T${recurringTime}`;
      for (const row of rows) {
        if (!row.enabled) continue;
        if (disabledUids.has(row.uid)) continue;
        const start = addMinutes(baseStart, row.offsetMinutes);
        const end = addMinutes(start, row.durationMinutes);
        result.push({
          key: `${date}_${row.uid}`,
          date,
          name: row.name,
          startTime: start,
          endTime: end,
          location: row.location,
          description: row.description,
          maxParticipants: Number(row.maxParticipants) || 1,
          reward: Number(row.reward) || 0,
          post: row.post === '' ? null : row.post,
          openToInternationals: row.openToInternationals,
          instructions: row.instructions,
        });
      }
    }
    return result;
  }, [mode, enabledRows, rows, targetDates, dayOverrides, recurringTime]);

  const problems = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of enabledRows) {
      const errors: string[] = [];
      if (row.name.trim() === '') errors.push(nl ? 'Naam ontbreekt.' : 'Name is missing.');
      if (row.location.trim() === '') errors.push(nl ? 'Locatie ontbreekt.' : 'Location is missing.');
      if (row.description.trim() === '') errors.push(nl ? 'Beschrijving ontbreekt.' : 'Description is missing.');
      // Dezelfde regel als de API: wie geen superadmin is, maakt enkel shiften
      // voor een eigen post. Zonder deze check faalt de reeks pas halverwege.
      if (!allowNoPost && !postOptions.includes(row.post))
        errors.push(
          nl
            ? 'Kies een van je eigen posten; voor een andere post kan je geen shift aanmaken.'
            : 'Pick one of your own posts; you cannot create a shift for another post.',
        );
      if (mode === 'single') {
        const length = minutesBetween(row.start, row.end);
        if (length === null) errors.push(nl ? 'Vul begin en einde in.' : 'Fill in start and end.');
        else if (length <= 0) errors.push(nl ? 'Het einde ligt voor het begin.' : 'The end is before the start.');
      } else {
        if (!row.durationMinutes || row.durationMinutes < 5) {
          errors.push(nl ? 'Duur moet minstens 5 minuten zijn.' : 'Duration must be at least 5 minutes.');
        }
      }
      const spots = Number(row.maxParticipants);
      if (!Number.isInteger(spots) || spots < 1) errors.push(nl ? 'Minstens één plaats.' : 'At least one spot.');
      const reward = Number(row.reward);
      if (!Number.isInteger(reward) || reward < 0)
        errors.push(nl ? 'Beloning kan niet negatief zijn.' : 'Reward cannot be negative.');
      if (errors.length > 0) map.set(row.uid, errors);
    }
    return map;
  }, [enabledRows, nl, mode, allowNoPost, postOptions]);

  const dateError = useMemo(() => {
    if (mode !== 'recurring') return null;
    if (!startDate || !endDate) return nl ? 'Kies een start- en einddatum.' : 'Pick a start and end date.';
    if (startDate > endDate) return nl ? 'Einddatum kan niet voor de startdatum liggen.' : 'End date cannot be before start date.';
    if (addDaysToYmd(startDate, MAX_RANGE_DAYS) < endDate)
      return nl
        ? `Een reeks loopt hoogstens ${MAX_RANGE_DAYS} dagen; splits ze op.`
        : `A series spans at most ${MAX_RANGE_DAYS} days; split it up.`;
    if (activeWeekdays.length === 0) return nl ? 'Selecteer minstens één weekdag.' : 'Select at least one weekday.';
    if (targetDates.length === 0) return nl ? 'Geen actieve dagen in dit datumbereik.' : 'No active days in this date range.';
    return null;
  }, [mode, startDate, endDate, activeWeekdays, targetDates, nl]);

  const totals = useMemo(() => {
    const spots = allPreparedShifts.reduce((sum, s) => sum + s.maxParticipants, 0);
    const vouchers = allPreparedShifts.reduce((sum, s) => sum + s.reward * s.maxParticipants, 0);
    const uniqueDates = new Set(allPreparedShifts.map((s) => s.date));
    const starts = allPreparedShifts.map((s) => s.startTime).filter(Boolean).sort();
    const ends = allPreparedShifts.map((s) => s.endTime).filter(Boolean).sort();
    return {
      count: allPreparedShifts.length,
      daysCount: uniqueDates.size,
      spots,
      vouchers,
      first: starts[0] ?? '',
      last: ends[ends.length - 1] ?? '',
    };
  }, [allPreparedShifts]);

  const todo = allPreparedShifts.filter((shift) => !doneUids.includes(shift.key));
  // Zodra een deel al aangemaakt is, zou een andere modus of een ander sjabloon
  // nieuwe sleutels geven en die shiften een tweede keer aanmaken.
  const locked = doneUids.length > 0;
  const tooMany = todo.length > MAX_SHIFTS_PER_RUN;
  const blocked = busy || todo.length === 0 || problems.size > 0 || dateError !== null || tooMany;

  async function createAll() {
    setBusy(true);
    setFailure(null);

    const done = [...doneUids];
    let problem: string | null = null;

    for (const shift of todo) {
      try {
        const resp = await fetch('/api/shift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toShiftBody(shift)),
        });
        if (!resp.ok) {
          problem = `${shift.name} (${shift.startTime.slice(0, 10)}): ${await describeFailure(resp)}`;
          break;
        }
      } catch {
        problem = `${shift.name}: ${nl ? 'geen verbinding met de server' : 'no connection to the server'}`;
        break;
      }
      done.push(shift.key);
      setDoneUids([...done]);
    }

    if (problem) {
      setBusy(false);
      const left = todo.length - (done.length - doneUids.length);
      const message = nl
        ? `${done.length} van ${allPreparedShifts.length} shift(en) aangemaakt. ${problem}. Klik opnieuw om enkel de overige ${left} aan te maken.`
        : `Created ${done.length} of ${allPreparedShifts.length} shift(s). ${problem}. Click again to create just the remaining ${left}.`;
      setFailure(message);
      showToast({ variant: 'error', message, duration: 0 });
      return;
    }

    showToast({
      variant: 'success',
      message: nl
        ? `${done.length} shift(en) aangemaakt en gepubliceerd.`
        : `Created and published ${done.length} shift(s).`,
    });
    router.push(overview);
    router.refresh();
  }

  function toggleDay(date: string) {
    touchForm();
    setDayOverrides((cur) => {
      const prev = cur[date] ?? { enabled: true, disabledShiftUids: [] };
      return {
        ...cur,
        [date]: { ...prev, enabled: prev.enabled === false },
      };
    });
  }

  function toggleShiftOnDay(date: string, uid: string) {
    touchForm();
    setDayOverrides((cur) => {
      const prev = cur[date] ?? { enabled: true, disabledShiftUids: [] };
      const currentDisabled = new Set(prev.disabledShiftUids ?? []);
      if (currentDisabled.has(uid)) {
        currentDisabled.delete(uid);
      } else {
        currentDisabled.add(uid);
      }
      return {
        ...cur,
        [date]: { ...prev, disabledShiftUids: [...currentDisabled] },
      };
    });
  }

  function toggleWeekday(dayId: number) {
    touchForm();
    setActiveWeekdays((cur) =>
      cur.includes(dayId) ? cur.filter((d) => d !== dayId) : [...cur, dayId].sort((a, b) => a - b)
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) void createAll();
      }}
      // Enter in een tekstveld mag niet meteen tot honderd shiften publiceren;
      // aanmaken gebeurt enkel met de knop.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      {/* Modus en globale velden */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-vtk-navy/10 pb-4">
          <div>
            <h2 className="text-lg font-semibold">{nl ? 'Algemeen' : 'General'}</h2>
            <p className="text-xs text-vtk-muted">
              {nl
                ? 'Kies voor een eenmalig evenement of maak een reeks van terugkerende dagen aan.'
                : 'Choose a single event or generate a series across recurring days.'}
            </p>
          </div>
          <div className="inline-flex rounded-full bg-vtk-blue-soft p-1">
            <button
              type="button"
              disabled={locked}
              aria-pressed={mode === 'single'}
              onClick={() => setMode('single')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                mode === 'single'
                  ? 'bg-vtk-ink text-vtk-surface-elevated shadow-sm'
                  : 'text-vtk-body hover:text-vtk-ink'
              }`}
            >
              {nl ? 'Enkele dag' : 'Single day'}
            </button>
            <button
              type="button"
              disabled={locked}
              aria-pressed={mode === 'recurring'}
              onClick={() => setMode('recurring')}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                mode === 'recurring'
                  ? 'bg-vtk-ink text-vtk-surface-elevated shadow-sm'
                  : 'text-vtk-body hover:text-vtk-ink'
              }`}
            >
              {nl ? 'Reeks (meerdere dagen)' : 'Recurring / Multiple days'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="template">{nl ? 'Sjabloon (optioneel)' : 'Template (optional)'}</Label>
            <Select
              id="template"
              value={templateId}
              disabled={locked}
              onChange={(e) => {
                if (dirty) setPendingTemplate(e.target.value);
                else selectTemplate(e.target.value);
              }}
            >
              <option value="">
                {nl ? '-- Vanaf nul opbouwen (geen sjabloon) --' : '-- Start from scratch (no template) --'}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            {template?.note ? (
              <p className="mt-1 text-xs text-vtk-muted">{template.note}</p>
            ) : (
              <p className="mt-1 text-xs text-vtk-muted">
                {nl
                  ? 'Kies optioneel een sjabloon als vertrekpunt, of bouw je shiften hieronder zelf op.'
                  : 'Optionally pick a template as a starting point, or build your shifts from scratch below.'}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="eventName">{nl ? 'Naam van het evenement' : 'Event name'}</Label>
            <Input id="eventName" value={globals.eventName} onChange={(e) => setGlobal('eventName', e.target.value)} />
            <p className="mt-1 text-xs text-vtk-muted">
              {nl
                ? 'Komt achter elke shiftnaam te staan, bv. “Tap 1 - Cantus”.'
                : 'Comes after every shift name, e.g. “Tap 1 - Cantus”.'}
            </p>
          </div>

          {mode === 'single' ? (
            <div>
              <Label htmlFor="start">{nl ? 'Start van het evenement' : 'Start of the event'}</Label>
              <Input
                id="start"
                type="datetime-local"
                value={globals.start}
                onChange={(e) => setGlobal('start', e.target.value)}
              />
              <p className="mt-1 text-xs text-vtk-muted">
                {nl
                  ? 'Alle shifttijden schuiven mee met dit uur.'
                  : 'All shift times move along with this moment.'}
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="recurringTime">{nl ? 'Startuur van de 1e shift' : 'Start time of 1st shift'}</Label>
              <Input
                id="recurringTime"
                type="time"
                value={recurringTime}
                onChange={(e) => {
                  touchForm();
                  setRecurringTime(e.target.value);
                }}
              />
              <p className="mt-1 text-xs text-vtk-muted">
                {nl ? 'Standaard uur voor elke dag in de reeks.' : 'Default start hour for each day in the series.'}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="location">{nl ? 'Locatie' : 'Location'}</Label>
            <Input id="location" value={globals.location} onChange={(e) => setGlobal('location', e.target.value)} />
          </div>

          <div>
            <Label htmlFor="post">Post</Label>
            <Select id="post" value={globals.post} onChange={(e) => setGlobal('post', e.target.value)}>
              {allowNoPost && <option value="">{nl ? 'Geen' : 'None'}</option>}
              {postOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Extra instellingen voor de reeks (meerdere dagen) */}
        {mode === 'recurring' && (
          <div className="mt-5 space-y-4 border-t border-vtk-navy/5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-vtk-ink">
                {nl ? 'Datumbereik en weekdagen' : 'Date range & weekdays'}
              </h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {thisWeekStart <= thisWeekEnd && (
                  <button
                    type="button"
                    onClick={() => {
                      touchForm();
                      setStartDate(thisWeekStart);
                      setEndDate(thisWeekEnd);
                      setActiveWeekdays([1, 2, 3, 4, 5]);
                    }}
                    className="rounded-lg border border-vtk-navy/10 bg-vtk-surface-elevated px-2.5 py-1 text-vtk-body hover:bg-vtk-blue-muted"
                  >
                    {thisWeekStart === currentMon
                      ? nl
                        ? 'Deze week (Ma–Vr)'
                        : 'This week (Mon–Fri)'
                      : nl
                        ? 'Rest van deze week'
                        : 'Rest of this week'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    touchForm();
                    setStartDate(nextMon);
                    setEndDate(addDaysToYmd(nextMon, 4));
                    setActiveWeekdays([1, 2, 3, 4, 5]);
                  }}
                  className="rounded-lg border border-vtk-navy/10 bg-vtk-surface-elevated px-2.5 py-1 text-vtk-body hover:bg-vtk-blue-muted"
                >
                  {nl ? 'Volgende week (Ma–Vr)' : 'Next week (Mon–Fri)'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="startDate">{nl ? 'Startdatum' : 'Start date'}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    touchForm();
                    setStartDate(e.target.value);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="endDate">{nl ? 'Einddatum (inclusief)' : 'End date (inclusive)'}</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    touchForm();
                    setEndDate(e.target.value);
                  }}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <Label>{nl ? 'Dagen van de week' : 'Weekdays'}</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {WEEKDAYS.map((d) => {
                    const active = activeWeekdays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleWeekday(d.id)}
                        className={`h-9 w-9 rounded-xl text-xs font-semibold transition-all ${
                          active
                            ? 'bg-vtk-blue text-vtk-surface-elevated shadow-sm'
                            : 'bg-vtk-blue-soft text-vtk-muted hover:bg-vtk-navy/10'
                        }`}
                      >
                        {nl ? d.nl : d.en}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {dateError && <p className="text-xs text-vtk-danger font-medium">{dateError}</p>}
            {!dateError && startDate < today && (
              <p className="text-xs font-medium text-vtk-warn">
                {nl
                  ? 'De reeks begint in het verleden; op die dagen kan niemand zich nog inschrijven.'
                  : 'The series starts in the past; nobody can sign up on those days any more.'}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Samenvatting van wat er straks aangemaakt wordt */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl bg-vtk-blue-soft px-4 py-3 text-sm">
        <span>
          <strong>{allPreparedShifts.length}</strong> {nl ? 'shift(en)' : 'shift(s)'}
        </span>
        {mode === 'recurring' && (
          <span>
            <strong>{totals.daysCount}</strong> {nl ? 'actieve dag(en)' : 'active day(s)'}
          </span>
        )}
        <span>
          <strong>{totals.spots}</strong> {nl ? 'plaatsen' : 'spots'}
        </span>
        <span>
          <strong>{totals.vouchers}</strong> {nl ? 'bonnetjes bij volle bezetting' : 'vouchers at full occupancy'}
        </span>
        {totals.first && (
          <span className="text-vtk-muted">
            {mode === 'single'
              ? `${formatMoment(totals.first, locale)} → ${formatMoment(totals.last, locale)}`
              : `${formatDayLabel(totals.first.slice(0, 10), nl ? 'nl' : 'en')} → ${formatDayLabel(
                  totals.last.slice(0, 10),
                  nl ? 'nl' : 'en'
                )}`}
          </span>
        )}
      </div>

      {/* Shiften: de basislijst */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {template
                ? mode === 'recurring'
                  ? nl
                    ? 'Shiften in het sjabloon'
                    : 'Template shifts'
                  : nl
                    ? 'Shiften uit sjabloon'
                    : 'Shifts from template'
                : nl
                  ? 'De shiften'
                  : 'The shifts'}
            </h2>
            <p className="text-xs text-vtk-muted">
              {nl
                ? 'Klik op een shift om ze in of uit te klappen en de details aan te passen.'
                : 'Click a shift to expand or collapse it and adjust details.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                >
                  {nl ? 'Alles uitklappen' : 'Expand all'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                >
                  {nl ? 'Alles inklappen' : 'Collapse all'}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                touchForm();
                const newRow = blankRow(globals);
                setRows((cur) => [...cur, newRow]);
                setExpandedUids((cur) => new Set([...cur, newRow.uid]));
              }}
            >
              {nl ? 'Shift toevoegen' : 'Add shift'}
            </Button>
          </div>
        </div>

        {rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-vtk-muted">
            {nl ? 'Er zijn nog geen shiften toegevoegd. Klik op "Shift toevoegen".' : 'No shifts added yet. Click "Add shift".'}
          </Card>
        )}

        {rows.map((row, index) => {
          const errors = problems.get(row.uid) ?? [];
          const length = row.durationMinutes;
          const shiftClockStart = templateClockAt(recurringTime, row.offsetMinutes, nl);
          const shiftClockEnd = templateClockAt(recurringTime, row.offsetMinutes + row.durationMinutes, nl);
          const isExpanded = expandedUids.has(row.uid);

          return (
            <Card
              key={row.uid}
              className={`p-4 transition-all ${
                row.enabled ? '' : 'opacity-60 bg-vtk-blue-muted/50'
              } ${errors.length > 0 ? 'border-vtk-danger-line' : ''}`}
            >
              {/* Header: altijd zichtbaar, klikbaar om in/uit te klappen */}
              <div
                className="flex cursor-pointer flex-wrap items-center justify-between gap-3 select-none"
                onClick={() => toggleExpand(row.uid)}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <label
                    className="inline-flex items-center cursor-pointer p-0.5"
                    onClick={(e) => e.stopPropagation()}
                    title={
                      row.enabled
                        ? nl
                          ? 'Shift uitschakelen'
                          : 'Disable shift'
                        : nl
                          ? 'Shift inschakelen'
                          : 'Enable shift'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateRow(row.uid, { enabled: e.target.checked })}
                      className="cursor-pointer rounded border-vtk-navy/20"
                    />
                    <span className="sr-only">
                      {row.enabled ? (nl ? 'Shift uitschakelen' : 'Disable shift') : (nl ? 'Shift inschakelen' : 'Enable shift')}
                    </span>
                  </label>

                  <span className="text-sm font-semibold text-vtk-ink hover:text-vtk-blue transition-colors">
                    {index + 1}. {row.name.trim() || row.baseName || (nl ? 'Naamloze shift' : 'Unnamed shift')}
                  </span>

                  {row.enabled && length > 0 && (
                    <span className="rounded-full bg-vtk-blue-soft px-2.5 py-0.5 text-xs text-vtk-body font-medium">
                      {mode === 'single'
                        ? `${formatMoment(row.start, locale)} · ${formatDuration(length, nl)}`
                        : `${shiftClockStart.slice(0, 5)} – ${shiftClockEnd.slice(0, 5)} · ${formatDuration(length, nl)}`}
                    </span>
                  )}

                  {row.enabled && (
                    <span className="rounded-full bg-vtk-blue-soft px-2.5 py-0.5 text-xs text-vtk-body">
                      {row.maxParticipants} {nl ? 'plaatsen' : 'spots'} · {row.reward} {nl ? 'bonnetjes' : 'vouchers'}
                    </span>
                  )}

                  {row.enabled && row.location && (
                    <span className="hidden sm:inline-block text-xs text-vtk-muted">
                      {row.location}
                    </span>
                  )}

                  {row.enabled && row.post && (
                    <span className="hidden md:inline-block rounded-full bg-vtk-blue-soft px-2 py-0.5 text-[11px] font-medium text-vtk-blue">
                      {row.post}
                    </span>
                  )}

                  {!row.enabled && (
                    <span className="rounded-full bg-vtk-warn-soft px-2.5 py-0.5 text-xs font-medium text-vtk-warn">
                      {nl ? 'Niet actief' : 'Disabled'}
                    </span>
                  )}

                  {errors.length > 0 && (
                    <span className="rounded-full bg-vtk-danger-soft px-2.5 py-0.5 text-xs font-semibold text-vtk-danger">
                      {errors.length} {nl ? 'aandachtspunt(en)' : 'issue(s)'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <IconButton
                    label={nl ? 'Rij verwijderen' : 'Remove row'}
                    srLabel={`${nl ? 'Rij verwijderen' : 'Remove row'}: ${row.name}`}
                    tone="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRow(row.uid);
                    }}
                  >
                    <TrashIcon />
                  </IconButton>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(row.uid);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-vtk-muted hover:bg-vtk-blue-soft hover:text-vtk-body transition-colors"
                    aria-label={isExpanded ? (nl ? 'Inklappen' : 'Collapse') : (nl ? 'Uitklappen' : 'Expand')}
                    title={isExpanded ? (nl ? 'Inklappen' : 'Collapse') : (nl ? 'Uitklappen' : 'Expand')}
                  >
                    {isExpanded ? (
                      <ChevronUp size={18} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Inhoud: enkel zichtbaar wanneer uitgeklapt */}
              {isExpanded && (
                <div className="mt-4 border-t border-vtk-navy/5 pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2">
                      <Label>{nl ? 'Naam' : 'Name'}</Label>
                      <Input
                        value={row.name}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { name: e.target.value }, 'name')}
                      />
                    </div>

                    {mode === 'single' ? (
                      <>
                        <div>
                          <Label>{nl ? 'Begin' : 'Start'}</Label>
                          <Input
                            type="datetime-local"
                            value={row.start}
                            disabled={!row.enabled}
                            onChange={(e) => moveRowStart(row, e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>{nl ? 'Einde' : 'End'}</Label>
                          <Input
                            type="datetime-local"
                            value={row.end}
                            disabled={!row.enabled}
                            onChange={(e) => moveRowEnd(row, e.target.value)}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <Label>{nl ? 'Begin (dagelijks)' : 'Start (daily)'}</Label>
                          <Input
                            type="time"
                            value={shiftClockStart.slice(0, 5)}
                            disabled={!row.enabled}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const baseM = clockToMinutes(recurringTime);
                              // Een shift na middernacht (+1 dag) blijft op die dag staan.
                              const dayShift = Math.floor((baseM + row.offsetMinutes) / 1440);
                              const newOffset = clockToMinutes(e.target.value) + dayShift * 1440 - baseM;
                              setRowOffsetAndDuration(row, newOffset, row.durationMinutes);
                            }}
                          />
                        </div>
                        <div>
                          <Label>{nl ? 'Einde (dagelijks)' : 'End (daily)'}</Label>
                          <Input
                            type="time"
                            value={shiftClockEnd.slice(0, 5)}
                            disabled={!row.enabled}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              // Enkel het uur telt: het einde ligt altijd binnen 24 uur na het begin.
                              const startM = (((clockToMinutes(recurringTime) + row.offsetMinutes) % 1440) + 1440) % 1440;
                              const endM = clockToMinutes(e.target.value);
                              const newDuration = endM >= startM ? endM - startM : endM + 1440 - startM;
                              setRowOffsetAndDuration(row, row.offsetMinutes, Math.max(5, newDuration));
                            }}
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <Label>{nl ? 'Plaatsen' : 'Spots'}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.maxParticipants}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { maxParticipants: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{nl ? 'Bonnetjes' : 'Vouchers'}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={row.reward}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { reward: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{nl ? 'Locatie' : 'Location'}</Label>
                      <Input
                        value={row.location}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { location: e.target.value }, 'location')}
                      />
                    </div>
                    <div>
                      <Label>Post</Label>
                      <Select
                        value={row.post}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { post: e.target.value }, 'post')}
                      >
                        {allowNoPost && <option value="">{nl ? 'Geen' : 'None'}</option>}
                        {postOptions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        {row.post !== '' && !postOptions.includes(row.post) && <option value={row.post}>{row.post}</option>}
                      </Select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <Label>{nl ? 'Beschrijving' : 'Description'}</Label>
                      <Input
                        value={row.description}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { description: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <Label>{nl ? 'Uitleg (optioneel)' : 'Explanation (optional)'}</Label>
                      <Textarea
                        value={row.instructions}
                        rows={2}
                        disabled={!row.enabled}
                        onChange={(e) => updateRow(row.uid, { instructions: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.openToInternationals}
                          disabled={!row.enabled}
                          onChange={(e) => updateRow(row.uid, { openToInternationals: e.target.checked })}
                        />
                        <span>{nl ? 'Ook voor internationals' : 'Open to internationals'}</span>
                      </label>
                    </div>
                  </div>

                  {errors.length > 0 && (
                    <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-vtk-danger">
                      {errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Aanpassingen per dag (enkel in de reeksmodus) */}
      {mode === 'recurring' && targetDates.length > 0 && (
        <div className="space-y-3 pt-3">
          <div>
            <h2 className="text-lg font-semibold">{nl ? 'Aanpassingen per dag' : 'Per-day adjustments'}</h2>
            <p className="text-xs text-vtk-muted">
              {nl
                ? 'Vink een dag uit als ze gesloten is. Klik op een shift om die voor die specifieke dag uit te zetten (bv. als de namiddagshift er op vrijdag niet is, of als de ochtendshift niet online moet komen).'
                : 'Uncheck a day if it is closed. Click a shift to skip it for that specific day (e.g. if the afternoon shift is absent on Friday, or the morning shift should not be online).'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {targetDates.map((date) => {
              const isDayOpen = dayOverrides[date]?.enabled !== false;
              const disabledUids = new Set(dayOverrides[date]?.disabledShiftUids ?? []);
              const activeCount = enabledRows.filter((r) => !disabledUids.has(r.uid)).length;
              const isDayExpanded = !collapsedDayDates.has(date);

              return (
                <Card
                  key={date}
                  className={`p-4 transition-all ${
                    isDayOpen ? 'border-vtk-navy/10 bg-vtk-surface-elevated' : 'border-vtk-navy/10 bg-vtk-blue-muted/80 opacity-75'
                  }`}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between border-b border-vtk-navy/5 pb-2 select-none"
                    onClick={() => toggleDayExpand(date)}
                  >
                    <div className="flex items-center gap-2">
                      <label
                        className="inline-flex items-center cursor-pointer p-0.5"
                        onClick={(e) => e.stopPropagation()}
                        title={isDayOpen ? (nl ? 'Dag sluiten' : 'Close day') : (nl ? 'Dag openen' : 'Open day')}
                      >
                        <input
                          type="checkbox"
                          checked={isDayOpen}
                          onChange={() => toggleDay(date)}
                          className="cursor-pointer rounded border-vtk-navy/20"
                        />
                        <span className="sr-only">
                          {isDayOpen ? (nl ? 'Dag sluiten' : 'Close day') : (nl ? 'Dag openen' : 'Open day')}
                        </span>
                      </label>
                      <span className="text-sm font-semibold capitalize text-vtk-ink hover:text-vtk-blue transition-colors">
                        {formatDayTitle(date, locale)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          isDayOpen
                            ? 'bg-vtk-blue-soft text-vtk-blue'
                            : 'bg-vtk-navy/10 text-vtk-body'
                        }`}
                      >
                        {isDayOpen
                          ? nl
                            ? `${activeCount} shift(en)`
                            : `${activeCount} shift(s)`
                          : nl
                            ? 'Gesloten'
                            : 'Closed'}
                      </span>
                      {isDayOpen && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDayExpand(date);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-vtk-muted hover:text-vtk-body transition-colors"
                          aria-label={isDayExpanded ? (nl ? 'Inklappen' : 'Collapse') : (nl ? 'Uitklappen' : 'Expand')}
                        >
                          {isDayExpanded ? (
                            <ChevronUp size={16} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={16} aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {isDayOpen && isDayExpanded && (
                    <div className="pt-3">
                      <div className="flex flex-wrap gap-2">
                        {enabledRows.map((row, i) => {
                          const isSkipped = disabledUids.has(row.uid);
                          const sClock = templateClockAt(recurringTime, row.offsetMinutes, nl).slice(0, 5);
                          const eClock = templateClockAt(recurringTime, row.offsetMinutes + row.durationMinutes, nl).slice(0, 5);

                          return (
                            <button
                              key={row.uid}
                              type="button"
                              onClick={() => toggleShiftOnDay(date, row.uid)}
                              title={
                                isSkipped
                                  ? nl
                                    ? 'Klik om deze shift weer aan te zetten'
                                    : 'Click to enable this shift again'
                                  : nl
                                    ? 'Klik om deze shift over te slaan voor deze dag'
                                    : 'Click to skip this shift for this day'
                              }
                              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                                !isSkipped
                                  ? 'border-vtk-blue/30 bg-vtk-blue-soft/50 text-vtk-ink hover:bg-vtk-blue-soft'
                                  : 'border-vtk-navy/10 bg-vtk-blue-soft/90 text-vtk-muted line-through hover:bg-vtk-navy/10'
                              }`}
                            >
                              <span>
                                {i + 1}. {row.baseName}
                              </span>
                              <span className="text-[10px] opacity-70 no-underline">
                                ({sClock}–{eClock})
                              </span>
                              {isSkipped && (
                                <span className="font-semibold text-vtk-warn no-underline">{nl ? 'uit' : 'off'}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Voorvertoning van alle concrete shiften */}
      {allPreparedShifts.length > 0 && (
        <Card className="overflow-hidden border-vtk-navy/10">
          <div
            className="flex cursor-pointer items-center justify-between p-4 bg-vtk-blue-muted/80 hover:bg-vtk-blue-soft/70 select-none transition-colors"
            onClick={() => setShowPreviewTable((cur) => !cur)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-vtk-ink">
                {nl ? 'Voorvertoning van alle shiften' : 'Preview of all shifts'}
              </h3>
              <span className="rounded-full bg-vtk-navy/10 px-2 py-0.5 text-xs font-medium text-vtk-body">
                {allPreparedShifts.length} {nl ? 'shift(en)' : 'shift(s)'}
              </span>
              <span className="text-xs text-vtk-muted">
                ({showPreviewTable ? (nl ? 'klik om in te klappen' : 'click to collapse') : (nl ? 'klik om uit te klappen' : 'click to expand')})
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPreviewTable((cur) => !cur);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-vtk-muted hover:text-vtk-ink hover:bg-vtk-navy/10 transition-colors"
              aria-label={showPreviewTable ? (nl ? 'Inklappen' : 'Collapse') : (nl ? 'Uitklappen' : 'Expand')}
              title={showPreviewTable ? (nl ? 'Inklappen' : 'Collapse') : (nl ? 'Uitklappen' : 'Expand')}
            >
              {showPreviewTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          {showPreviewTable && (
            <div className="relative max-h-96 overflow-auto border-t border-vtk-navy/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-vtk-blue-soft text-vtk-body border-b border-vtk-navy/10">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">{nl ? 'Datum' : 'Date'}</th>
                    <th className="px-3 py-2 font-medium">{nl ? 'Shiftnaam' : 'Shift name'}</th>
                    <th className="px-3 py-2 font-medium">{nl ? 'Uur' : 'Time'}</th>
                    <th className="px-3 py-2 font-medium">{nl ? 'Plaatsen' : 'Spots'}</th>
                    <th className="px-3 py-2 font-medium">{nl ? 'Bonnetjes' : 'Vouchers'}</th>
                    <th className="px-3 py-2 font-medium">{nl ? 'Locatie' : 'Location'}</th>
                    <th className="px-3 py-2 font-medium">Post</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vtk-navy/5">
                  {allPreparedShifts.map((s, idx) => (
                    <tr key={s.key} className="hover:bg-vtk-blue-muted/60">
                      <td className="px-3 py-2 text-vtk-muted">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-vtk-body">
                        {formatDayLabel(s.date, nl ? 'nl' : 'en')}
                      </td>
                      <td className="px-3 py-2 font-medium text-vtk-ink">{s.name}</td>
                      <td className="px-3 py-2 text-vtk-body">
                        {s.startTime.slice(11, 16)}–{s.endTime.slice(11, 16)}
                      </td>
                      <td className="px-3 py-2 text-vtk-body">{s.maxParticipants}</td>
                      <td className="px-3 py-2 text-vtk-body">{s.reward}</td>
                      <td className="px-3 py-2 text-vtk-body">{s.location || '—'}</td>
                      <td className="px-3 py-2 text-vtk-body">{s.post || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {failure !== null && (
        <div className="rounded-2xl border border-vtk-danger-line bg-vtk-danger-soft px-4 py-3 text-sm text-vtk-danger">
          {failure}
          {locked && (
            <span className="mt-1 block">
              {nl
                ? 'Modus en sjabloon liggen vast tot de rest aangemaakt is; zo worden de aangemaakte shiften geen tweede keer gemaakt.'
                : 'Mode and template are locked until the rest is created, so the created shifts are not made a second time.'}
            </span>
          )}
        </div>
      )}

      {allPreparedShifts.length === 0 && (
        <p className="text-sm text-vtk-muted">
          {nl
            ? 'Geen enkele shift geselecteerd om aan te maken.'
            : 'No shifts selected to create.'}
        </p>
      )}

      {problems.size > 0 && (
        <p className="text-sm text-vtk-danger">
          {nl
            ? `${problems.size} shift(en) zijn nog niet in orde; kijk de rode kaders na.`
            : `${problems.size} shift(s) are not ready yet; check the red cards.`}
        </p>
      )}

      {tooMany && (
        <p className="text-sm text-vtk-danger">
          {nl
            ? `Meer dan ${MAX_SHIFTS_PER_RUN} shiften in één keer; splits het op in twee reeksen.`
            : `More than ${MAX_SHIFTS_PER_RUN} shifts at once; split it into two runs.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={blocked}>
          {busy
            ? nl
              ? `Bezig met aanmaken... (${doneUids.length}/${allPreparedShifts.length})`
              : `Creating... (${doneUids.length}/${allPreparedShifts.length})`
            : mode === 'single'
              ? todo.length === 1
                ? nl
                  ? '1 shift aanmaken'
                  : 'Create 1 shift'
                : nl
                  ? `${todo.length} shiften aanmaken`
                  : `Create ${todo.length} shifts`
              : nl
                ? `${todo.length} shiften aanmaken (${totals.daysCount} dag${totals.daysCount === 1 ? '' : 'en'})`
                : `Create ${todo.length} shifts (${totals.daysCount} day${totals.daysCount === 1 ? '' : 's'})`}
        </Button>
      </div>

      <ConfirmDialog
        open={pendingTemplate !== null}
        title={
          pendingTemplate === ''
            ? nl
              ? 'Vanaf nul herbeginnen?'
              : 'Start from scratch?'
            : nl
              ? 'Ander sjabloon laden?'
              : 'Load another template?'
        }
        description={
          pendingTemplate === ''
            ? nl
              ? 'De shiften hieronder worden leeggemaakt zodat je vanaf nul kan beginnen. Je huidige aanpassingen gaan daarbij verloren.'
              : 'The shifts below will be reset so you can build from scratch. Your current unsaved edits will be lost.'
            : nl
              ? 'De shiften hieronder worden opnieuw opgebouwd uit het gekozen sjabloon. Je aanpassingen aan tijden, aantallen en namen gaan daarbij verloren; er is nog niets aangemaakt, dus in de databank verandert er niets.'
              : 'The shifts below are rebuilt from the chosen template. Your edits to times, counts and names are lost; nothing has been created yet, so nothing changes in the database.'
        }
        destructive={false}
        confirmLabel={
          pendingTemplate === ''
            ? nl
              ? 'Vanaf nul beginnen'
              : 'Start from scratch'
            : nl
              ? 'Sjabloon laden'
              : 'Load template'
        }
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onConfirm={() => {
          if (pendingTemplate !== null) selectTemplate(pendingTemplate);
          setPendingTemplate(null);
        }}
        onCancel={() => setPendingTemplate(null)}
      />
    </form>
  );
}
