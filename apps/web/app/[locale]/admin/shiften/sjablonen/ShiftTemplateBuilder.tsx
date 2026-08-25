'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { Button, Card, ConfirmDialog, Input, Label, Select, Textarea } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import { IconButton } from '@/components/ui/IconButton';
import { TrashIcon } from '@/components/ui/icons';
import { composeName, type ShiftTemplate } from '@/lib/shift/templates';

// -----------------------------------------------------------------------------
// Reken- en formatteerhulpjes.
//
// Alle tijden zijn wandkloktijden ("YYYY-MM-DDTHH:mm", zoals een datetime-local
// input) en de server leest ze als Belgische tijd. De rekenkunde hieronder gaat
// daarom bewust over de wandklok en niet over een echte tijdlijn: "twee uur
// later" hoort in dit scherm 20:00 -> 22:00 te zijn, ook in de nacht waarin de
// klok verzet wordt. Date.UTC houdt de zomertijd van de browser erbuiten.
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

/**
 * Startmoment waarmee het scherm opent: de dag die de server meegeeft, op het uur
 * dat het sjabloon voorstelt. De dag komt bewust van de server en niet uit
 * `new Date()` hier: de server-render en de hydratie zouden anders van elkaar
 * kunnen verschillen (andere tijdzone, of net over middernacht).
 */
function defaultStart(template: ShiftTemplate, today: string): string {
  const time = /^\d{2}:\d{2}$/.test(template.defaults.timeOfDay ?? '')
    ? (template.defaults.timeOfDay as string)
    : '20:00';
  return `${today}T${time}`;
}

// -----------------------------------------------------------------------------
// De werkkopie: globale velden + één rij per shift.
// -----------------------------------------------------------------------------

type Globals = {
  /** Komt achter de shiftnaam te staan: "Bar 1 - Cantus". Leeg = enkel de shiftnaam. */
  eventName: string;
  /** Startmoment van de eerste shift (offset 0); alle offsets rekenen hiervandaan. */
  start: string;
  location: string;
  /** "" = geen post. */
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
  /** Positie in het sjabloon, om de tijden te herberekenen als het startmoment wijzigt. */
  offsetMinutes: number;
  /**
   * Lengte van de shift, apart bijgehouden en niet uit `start`/`end` afgeleid:
   * die twee zijn nog leeg zolang het startmoment niet ingevuld is, en dan is er
   * niets om uit te rekenen.
   */
  durationMinutes: number;
  /** De naam zonder het evenement erachter, om die te kunnen herberekenen. */
  baseName: string;
  /** Het sjabloon geeft deze shift een eigen locatie/post: globaal wijzigen raakt ze niet. */
  ownLocation: boolean;
  ownPost: boolean;
  /** Velden die de gebruiker zelf aanpaste; die overschrijven we nooit meer. */
  touched: { name?: boolean; time?: boolean; location?: boolean; post?: boolean };
};

/**
 * Bovengrens op wat één klik verstuurt. Elke shift is een eigen request, dus een
 * per ongeluk uitgedijde lijst zou hier een stortvloed worden. Een cantus zet er
 * een tiental neer; wie hier tegenaan loopt, heeft niet echt honderd shiften nodig.
 */
const MAX_SHIFTS_PER_RUN = 100;

/**
 * De body van `POST /api/shift`, identiek aan wat het losse shiftformulier
 * (`ShiftEditModal`) verstuurt. Dit scherm is een sneltoets op dat formulier en
 * geen tweede manier om shiften te maken: dezelfde route, dezelfde validatie,
 * dezelfde logregels.
 */
function toShiftBody(row: Row) {
  return {
    name: row.name.trim(),
    startTime: row.start,
    endTime: row.end,
    location: row.location.trim(),
    description: row.description.trim(),
    maxParticipants: Number(row.maxParticipants),
    reward: Number(row.reward),
    post: row.post === '' ? null : row.post,
    openToInternationals: row.openToInternationals,
    instructions: row.instructions.trim() === '' ? null : row.instructions,
  };
}

/** Leest de foutuitleg uit een mislukt antwoord van `/api/shift`. */
async function describeFailure(resp: Response): Promise<string> {
  const data = (await resp.json().catch(() => null)) as
    | { error?: string; details?: string[] }
    | null;
  if (data?.details?.length) return data.details.join('; ');
  return data?.error ?? `HTTP ${resp.status}`;
}

function initialGlobals(template: ShiftTemplate, start: string, postOptions?: string[]): Globals {
  let defaultPost = template.defaults.post ?? '';
  if (postOptions && postOptions.length > 0 && !postOptions.includes(defaultPost)) {
    defaultPost = postOptions[0];
  }
  return {
    eventName: template.defaults.eventName,
    start,
    location: template.defaults.location,
    post: defaultPost,
  };
}

function buildRows(template: ShiftTemplate, globals: Globals, postOptions?: string[]): Row[] {
  return template.shifts.map((entry, index) => {
    let post = entry.post !== undefined ? (entry.post ?? '') : globals.post;
    if (postOptions && postOptions.length > 0 && !postOptions.includes(post)) {
      post = globals.post;
    }
    return {
      uid: `${template.id}-${entry.key}-${index}`,
      enabled: entry.enabled !== false,
      name: composeName(globals.eventName, entry.name),
      start: addMinutes(globals.start, entry.startOffsetMinutes),
      end: addMinutes(globals.start, entry.startOffsetMinutes + entry.durationMinutes),
      maxParticipants: String(entry.maxParticipants),
      reward: String(entry.reward),
      location: entry.location ?? globals.location,
      post,
      description: entry.description,
      instructions: entry.instructions ?? '',
      openToInternationals: entry.openToInternationals ?? false,
      offsetMinutes: entry.startOffsetMinutes,
      durationMinutes: entry.durationMinutes,
      baseName: entry.name,
      ownLocation: entry.location !== undefined,
      ownPost: entry.post !== undefined && (!postOptions || postOptions.includes(entry.post ?? '')),
      touched: {},
    };
  });
}

/** Eén lege rij om zelf iets bij te zetten dat niet in het sjabloon zit. */
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
    // Zelf toegevoegd: de globale velden mogen deze rij niet meer overschrijven.
    touched: { name: true, time: true, location: true, post: true },
  };
}

// -----------------------------------------------------------------------------

export function ShiftTemplateBuilder({
  locale,
  templates,
  today,
  postOptions,
}: {
  locale: Locale;
  templates: ShiftTemplate[];
  /** Vandaag in Brussel ("YYYY-MM-DD"), door de server bepaald. */
  today: string;
  postOptions: string[];
}) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? templates[0], [templates, templateId]);

  const [globals, setGlobals] = useState<Globals>(() =>
    initialGlobals(template, defaultStart(template, today), postOptions),
  );
  const [rows, setRows] = useState<Row[]>(() =>
    buildRows(template, initialGlobals(template, defaultStart(template, today), postOptions), postOptions),
  );
  const [dirty, setDirty] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * De rijen die al aangemaakt zijn in een reeks die halverwege strandde. Elke
   * shift is een apart request, dus een netwerkfout laat er een paar bestaan;
   * zonder dit zou "opnieuw proberen" die eerste shiften een tweede keer
   * aanmaken. Na een volledig geslaagde reeks gaat deze lijst weer leeg: dan is
   * een volgende klik bewust een nieuwe reeks.
   */
  const [doneUids, setDoneUids] = useState<string[]>([]);
  const showToast = useToast();
  const router = useRouter();
  const overview = `${base}/admin/shiften`;

  /**
   * Markeert het formulier als bewerkt, zodat het wisselen van sjabloon eerst
   * vraagt of dat werk weg mag.
   */
  function touchForm() {
    setDirty(true);
  }

  function applyStart(current: Row[], start: string): Row[] {
    return current.map((row) =>
      row.touched.time
        ? row
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
    const next = templates.find((t) => t.id === id);
    if (!next) return;
    // Je wisselt van sjabloon, niet van datum: de gekozen dág blijft staan. Het
    // úúr komt van het nieuwe sjabloon, want dat hoort bij wat je gaat doen: een
    // cantus begint 's avonds, een theokotopening 's ochtends. Het uur van het
    // vorige sjabloon laten staan zet meteen de hele reeks op het verkeerde
    // moment, inclusief de opbouwshiften die eromheen gerekend worden.
    const day = globals.start.slice(0, 10) || today;
    const start = defaultStart(next, day);
    const nextGlobals = initialGlobals(next, start, postOptions);
    setTemplateId(id);
    setGlobals(nextGlobals);
    setRows(buildRows(next, nextGlobals, postOptions));
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

  /** Het einde schuift mee met het begin, zodat de lengte van de shift blijft. */
  function moveRowStart(row: Row, value: string) {
    updateRow(row.uid, { start: value, end: addMinutes(value, row.durationMinutes) }, 'time');
  }

  /** Het einde verzetten is de lengte veranderen; die blijft daarna gelden. */
  function moveRowEnd(row: Row, value: string) {
    const length = minutesBetween(row.start, value);
    updateRow(row.uid, { end: value, durationMinutes: length ?? row.durationMinutes }, 'time');
  }

  function removeRow(uid: string) {
    touchForm();
    setRows((cur) => cur.filter((row) => row.uid !== uid));
  }

  const enabledRows = useMemo(() => rows.filter((row) => row.enabled), [rows]);

  const problems = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of enabledRows) {
      const errors: string[] = [];
      if (row.name.trim() === '') errors.push(nl ? 'Naam ontbreekt.' : 'Name is missing.');
      if (row.location.trim() === '') errors.push(nl ? 'Locatie ontbreekt.' : 'Location is missing.');
      if (row.description.trim() === '') errors.push(nl ? 'Beschrijving ontbreekt.' : 'Description is missing.');
      const length = minutesBetween(row.start, row.end);
      if (length === null) errors.push(nl ? 'Vul begin en einde in.' : 'Fill in start and end.');
      else if (length <= 0) errors.push(nl ? 'Het einde ligt voor het begin.' : 'The end is before the start.');
      const spots = Number(row.maxParticipants);
      if (!Number.isInteger(spots) || spots < 1) errors.push(nl ? 'Minstens één plaats.' : 'At least one spot.');
      const reward = Number(row.reward);
      if (!Number.isInteger(reward) || reward < 0)
        errors.push(nl ? 'Beloning kan niet negatief zijn.' : 'Reward cannot be negative.');
      if (errors.length > 0) map.set(row.uid, errors);
    }
    return map;
  }, [enabledRows, nl]);

  const totals = useMemo(() => {
    const spots = enabledRows.reduce((sum, row) => sum + (Number(row.maxParticipants) || 0), 0);
    const vouchers = enabledRows.reduce(
      (sum, row) => sum + (Number(row.reward) || 0) * (Number(row.maxParticipants) || 0),
      0
    );
    const starts = enabledRows
      .map((row) => row.start)
      .filter(Boolean)
      .sort();
    const ends = enabledRows
      .map((row) => row.end)
      .filter(Boolean)
      .sort();
    return { spots, vouchers, first: starts[0] ?? '', last: ends[ends.length - 1] ?? '' };
  }, [enabledRows]);

  /** Wat er nog te doen is: na een halve reeks enkel de shiften die ontbreken. */
  const todo = enabledRows.filter((row) => !doneUids.includes(row.uid));
  const tooMany = todo.length > MAX_SHIFTS_PER_RUN;
  const blocked = busy || todo.length === 0 || problems.size > 0 || tooMany;

  /**
   * Maakt de shiften aan, één `POST /api/shift` per shift.
   *
   * Bewust dezelfde route als het losse shiftformulier, en bewust geen eigen
   * server action met een `createMany`: dan zou dit scherm een tweede manier
   * worden om een shift te maken, die stilletjes uit elkaar groeit met de eerste
   * zodra daar iets bijkomt.
   *
   * De prijs daarvan is dat de reeks niet één transactie is. Daarom stoppen we
   * bij de eerste fout in plaats van door te duwen: wat er staat, staat er, en
   * de volgende klik pikt de draad op bij de eerste die ontbreekt.
   */
  async function createAll() {
    setBusy(true);
    setFailure(null);

    const done = [...doneUids];
    let problem: string | null = null;

    for (const row of todo) {
      try {
        const resp = await fetch('/api/shift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toShiftBody(row)),
        });
        if (!resp.ok) {
          problem = `${row.name}: ${await describeFailure(resp)}`;
          break;
        }
      } catch {
        problem = `${row.name}: ${nl ? 'geen verbinding met de server' : 'no connection to the server'}`;
        break;
      }
      done.push(row.uid);
      setDoneUids([...done]);
    }

    if (problem) {
      setBusy(false);
      // Tegen de wachtrij van deze poging, niet tegen alle aangevinkte rijen:
      // wie na een halve reeks iets uitvinkt, kreeg anders een negatief getal.
      const left = todo.length - (done.length - doneUids.length);
      const message = nl
        ? `${done.length} van ${enabledRows.length} shift(en) aangemaakt. ${problem}. Klik opnieuw om enkel de overige ${left} aan te maken.`
        : `Created ${done.length} of ${enabledRows.length} shift(s). ${problem}. Click again to create just the remaining ${left}.`;
      setFailure(message);
      // Blijft staan tot ze weggeklikt wordt: een halve reeks moet je zien.
      showToast({ variant: 'error', message, duration: 0 });
      return;
    }

    // Bewust in "bezig" blijven staan: we navigeren weg, en zolang dat loopt mag
    // de knop niet opnieuw te klikken zijn.
    showToast({
      variant: 'success',
      message: nl
        ? `${done.length} shift(en) aangemaakt en gepubliceerd.`
        : `Created and published ${done.length} shift(s).`,
    });
    // De toastprovider staat in de locale-layout, boven beide schermen, dus de
    // melding overleeft deze navigatie en is op het overzicht nog te lezen.
    router.push(overview);
    // Het overzicht is een servercomponent die zelf uit de databank leest. De
    // shiften zijn via een route handler aangemaakt en niet via een server
    // action, dus niets heeft de clientrouter verteld dat zijn kopie verouderd
    // is; zonder dit kan je op een lijst zonder je eigen shiften belanden.
    router.refresh();
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) void createAll();
      }}
    >

      {/* Globale velden: wat per editie van het evenement verschilt. */}
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">{nl ? 'Algemeen' : 'General'}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="template">{nl ? 'Sjabloon' : 'Template'}</Label>
            <Select
              id="template"
              value={templateId}
              onChange={(e) => {
                if (dirty) setPendingTemplate(e.target.value);
                else selectTemplate(e.target.value);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            {template?.note && <p className="mt-1 text-xs text-zinc-400">{template.note}</p>}
          </div>
          <div>
            <Label htmlFor="eventName">{nl ? 'Naam van het evenement' : 'Event name'}</Label>
            <Input id="eventName" value={globals.eventName} onChange={(e) => setGlobal('eventName', e.target.value)} />
            <p className="mt-1 text-xs text-zinc-400">
              {nl
                ? 'Komt achter elke shiftnaam te staan, bv. “Tap 1 - Cantus”.'
                : 'Comes after every shift name, e.g. “Tap 1 - Cantus”.'}
            </p>
          </div>
          <div>
            <Label htmlFor="start">{nl ? 'Start van het evenement' : 'Start of the event'}</Label>
            <Input
              id="start"
              type="datetime-local"
              value={globals.start}
              onChange={(e) => setGlobal('start', e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-400">
              {nl
                ? 'Alle tijden hieronder schuiven mee, behalve die je zelf aanpaste.'
                : 'Every time below shifts along, except the ones you edited yourself.'}
            </p>
          </div>
          <div>
            <Label htmlFor="location">{nl ? 'Locatie' : 'Location'}</Label>
            <Input id="location" value={globals.location} onChange={(e) => setGlobal('location', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="post">Post</Label>
            <Select id="post" value={globals.post} onChange={(e) => setGlobal('post', e.target.value)}>
              <option value="">{nl ? 'Geen' : 'None'}</option>
              {postOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Samenvatting van wat er straks aangemaakt wordt. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-vtk-blue-soft px-4 py-3 text-sm">
        <span>
          <strong>{enabledRows.length}</strong> {nl ? 'shift(en)' : 'shift(s)'}
        </span>
        <span>
          <strong>{totals.spots}</strong> {nl ? 'plaatsen' : 'spots'}
        </span>
        <span>
          <strong>{totals.vouchers}</strong> {nl ? 'bonnetjes bij volle bezetting' : 'vouchers at full occupancy'}
        </span>
        {totals.first && (
          <span className="text-zinc-500">
            {formatMoment(totals.first, locale)} &rarr; {formatMoment(totals.last, locale)}
          </span>
        )}
      </div>

      {/* Per shift: nakijken en bijstellen. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{nl ? 'De shiften' : 'The shifts'}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              touchForm();
              setRows((cur) => [...cur, blankRow(globals)]);
            }}
          >
            {nl ? 'Shift toevoegen' : 'Add shift'}
          </Button>
        </div>

        {rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-zinc-500">
            {nl ? 'Dit sjabloon heeft geen shiften.' : 'This template has no shifts.'}
          </Card>
        )}

        {rows.map((row, index) => {
          const errors = problems.get(row.uid) ?? [];
          const length = minutesBetween(row.start, row.end);
          return (
            <Card
              key={row.uid}
              className={`p-4 ${row.enabled ? '' : 'opacity-60'} ${errors.length > 0 ? 'border-red-300' : ''}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(row.uid, { enabled: e.target.checked })}
                  />
                  <span>
                    {index + 1}. {row.baseName}
                  </span>
                </label>
                {row.enabled && length !== null && length > 0 && (
                  <span className="text-xs text-zinc-400">
                    {formatMoment(row.start, locale)} &middot; {formatDuration(length, nl)}
                  </span>
                )}
                {!row.enabled && (
                  <span className="text-xs text-zinc-400">{nl ? 'Wordt niet aangemaakt' : 'Will not be created'}</span>
                )}
                <span className="ml-auto">
                  <IconButton
                    label={nl ? 'Rij verwijderen' : 'Remove row'}
                    srLabel={`${nl ? 'Rij verwijderen' : 'Remove row'}: ${row.name}`}
                    tone="danger"
                    onClick={() => removeRow(row.uid)}
                  >
                    <TrashIcon />
                  </IconButton>
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label>{nl ? 'Naam' : 'Name'}</Label>
                  <Input
                    value={row.name}
                    disabled={!row.enabled}
                    onChange={(e) => updateRow(row.uid, { name: e.target.value }, 'name')}
                  />
                </div>
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
                  {/* Zonder dit lijntje lijkt het een bug dat deze ene rij niet
                      meeging met de locatie bovenaan. */}
                  {row.ownLocation && (
                    <p className="mt-1 text-xs text-zinc-400">
                      {nl
                        ? 'Vaste plek uit het sjabloon; volgt de algemene locatie niet.'
                        : 'Fixed spot from the template; does not follow the general location.'}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Post</Label>
                  <Select
                    value={row.post}
                    disabled={!row.enabled}
                    onChange={(e) => updateRow(row.uid, { post: e.target.value }, 'post')}
                  >
                    <option value="">{nl ? 'Geen' : 'None'}</option>
                    {postOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    {/* Een sjabloon kan een post noemen die intussen gedeactiveerd is. */}
                    {row.post !== '' && !postOptions.includes(row.post) && <option value={row.post}>{row.post}</option>}
                  </Select>
                  {row.ownPost && (
                    <p className="mt-1 text-xs text-zinc-400">
                      {nl
                        ? 'Vaste post uit het sjabloon; volgt de algemene post niet.'
                        : 'Fixed group from the template; does not follow the general group.'}
                    </p>
                  )}
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
                    rows={3}
                    disabled={!row.enabled}
                    onChange={(e) => updateRow(row.uid, { instructions: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="flex items-center gap-2 text-sm">
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
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-red-600">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {failure !== null && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{failure}</div>
      )}

      {enabledRows.length === 0 && (
        <p className="text-sm text-zinc-500">{nl ? 'Vink minstens één shift aan.' : 'Tick at least one shift.'}</p>
      )}
      {problems.size > 0 && (
        <p className="text-sm text-red-600">
          {nl
            ? `${problems.size} shift(en) zijn nog niet in orde; kijk de rode kaders na.`
            : `${problems.size} shift(s) are not ready yet; check the red cards.`}
        </p>
      )}
      {tooMany && (
        <p className="text-sm text-red-600">
          {nl
            ? `Meer dan ${MAX_SHIFTS_PER_RUN} shiften in één keer; splits het op in twee reeksen.`
            : `More than ${MAX_SHIFTS_PER_RUN} shifts at once; split it into two runs.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={blocked}>
          {busy
            ? nl
              ? `Bezig met aanmaken... (${doneUids.length}/${enabledRows.length})`
              : `Creating... (${doneUids.length}/${enabledRows.length})`
            : todo.length === 1
              ? nl
                ? '1 shift aanmaken'
                : 'Create 1 shift'
              : nl
                ? `${todo.length} shiften aanmaken`
                : `Create ${todo.length} shifts`}
        </Button>
      </div>

      <ConfirmDialog
        open={pendingTemplate !== null}
        title={nl ? 'Ander sjabloon laden?' : 'Load another template?'}
        description={
          nl
            ? 'De shiften hieronder worden opnieuw opgebouwd uit het nieuwe sjabloon. Je aanpassingen aan tijden, aantallen en namen gaan daarbij verloren; er is nog niets aangemaakt, dus in de databank verandert er niets.'
            : 'The shifts below are rebuilt from the new template. Your edits to times, counts and names are lost; nothing has been created yet, so nothing changes in the database.'
        }
        destructive={false}
        confirmLabel={nl ? 'Sjabloon laden' : 'Load template'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onConfirm={() => {
          if (pendingTemplate) selectTemplate(pendingTemplate);
          setPendingTemplate(null);
        }}
        onCancel={() => setPendingTemplate(null)}
      />
    </form>
  );
}
