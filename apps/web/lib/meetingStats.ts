/**
 * De rekenkant van de tab Statistieken op /admin/bureau. Puur, zonder
 * `server-only`: `meetingStatsLoad.ts` haalt de rijen op, dit bestand telt, en
 * zo zijn de randgevallen (een bureau zonder `opensAt`, de overgang naar
 * wintertijd, de grens van 15 juli) zonder database te testen.
 *
 * Wat telt, staat in docs/design-decisions.md ("Statistieken van het VTK
 * Bureau"): wie **nu** ingeschreven is. Annuleren wist de rij, dus wie zich
 * uitschreef, telt nergens mee. De beller geeft enkel `ACTIVE` rijen mee,
 * zodat het aantal hetzelfde is als "Ingeschreven" op de tab Beheer
 * (`loadBureauTotals`). Het tijdstip is `createdAt` en de dag is die van de
 * Brusselse klok.
 */

import { brusselsParts, bucketRange } from './ticketing/statsCompute';

/** Sleutel voor een inschrijving van voor de meting (`source = null`). */
export const UNMEASURED = '__unmeasured';
/** Sleutel voor de kanalen die niet in de top van een grafiek staan. */
export const OTHER = '__other';
/** Zoveel kanalen krijgen een eigen kleur; de rest valt onder {@link OTHER}. */
export const TOP_SOURCES = 3;

export type StatsReservation = {
  userId: string;
  createdAt: Date;
  source: string | null;
  sourceCampaign: string | null;
};

export type StatsMeeting = {
  id: string;
  startsAt: Date;
  opensAt: Date | null;
  reservations: StatsReservation[];
};

export type Series = { key: string; values: number[] };

const keyOf = (reservation: StatsReservation) => reservation.source ?? UNMEASURED;

/**
 * De kanalen op volgorde van grootte, "niet gemeten" altijd achteraan: het is
 * geen kanaal maar een gat in de meting. Gelijke aantallen op naam, zodat de
 * volgorde (en dus de kleur) niet verspringt tussen twee laadbeurten.
 */
function rankSources(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => {
      if (a === UNMEASURED) return 1;
      if (b === UNMEASURED) return -1;
      return y - x || a.localeCompare(b);
    })
    .map(([key]) => key);
}

function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
}

/**
 * Welke kanalen een eigen reeks krijgen: de grootste {@link TOP_SOURCES}, de
 * rest samen als {@link OTHER}, en "niet gemeten" altijd apart en achteraan.
 * Dat laatste is geen kanaal maar een gat in de meting en mag nooit onder
 * "Andere" verdwijnen. Over alle rijen heen, zodat het jaaroverzicht voor elk
 * bureau dezelfde kleur voor hetzelfde kanaal gebruikt.
 */
export function seriesKeys(reservations: StatsReservation[]): string[] {
  const ranked = rankSources(countBy(reservations, keyOf));
  const measured = ranked.filter((key) => key !== UNMEASURED);
  const keys = measured.length <= TOP_SOURCES ? measured : [...measured.slice(0, TOP_SOURCES), OTHER];
  return ranked.includes(UNMEASURED) ? [...keys, UNMEASURED] : keys;
}

function seriesFor(keys: string[], buckets: string[], rows: { bucket: string; key: string }[]): Series[] {
  const index = new Map(buckets.map((bucket, i) => [bucket, i]));
  const own = new Set(keys);
  const series = keys.map((key) => ({ key, values: buckets.map(() => 0) }));
  for (const row of rows) {
    const i = index.get(row.bucket);
    if (i === undefined) continue;
    const target = series.find((s) => s.key === (own.has(row.key) ? row.key : OTHER));
    if (target) target.values[i] += 1;
  }
  return series;
}

export type MeetingCurve = { days: string[]; series: Series[] };

/**
 * Inschrijvingen per dag, van het openen tot het bureau (of tot vandaag als het
 * nog moet komen), gestapeld per herkomst. Zonder `opensAt` ("meteen open")
 * begint de as bij de eerste inschrijving. Een inschrijving buiten die as
 * (eerder dan `opensAt`, bv. omdat het openen later verschoof) rekt de as op
 * in plaats van weg te vallen.
 *
 * `promotions` rekt de as naar achter op zoals bij {@link cumulativeCurve},
 * zodat de staven en de lijn eronder op dezelfde dag beginnen. `keys` zijn de
 * reeksen; geef die van het hele jaar mee ({@link seriesKeys}), dan valt een
 * kanaal hier in dezelfde reeks (en kleur) als in het jaaroverzicht.
 */
export function meetingCurve(
  meeting: StatsMeeting,
  now: Date = new Date(),
  { promotions = [], keys }: { promotions?: Date[]; keys?: string[] } = {}
): MeetingCurve {
  const rows = meeting.reservations.map((reservation) => ({
    bucket: brusselsParts(reservation.createdAt).day,
    key: keyOf(reservation),
  }));
  if (rows.length === 0) return { days: [], series: [] };

  const sortedDays = rows.map((row) => row.bucket).sort();
  const firstDay = sortedDays[0];
  const lastDay = sortedDays[sortedDays.length - 1];
  const openDay = meeting.opensAt ? brusselsParts(meeting.opensAt).day : firstDay;
  const endDay = brusselsParts(now < meeting.startsAt ? now : meeting.startsAt).day;

  const from = [openDay, firstDay, ...promotions.map((at) => brusselsParts(at).day)].sort()[0];
  const to = endDay > lastDay ? endDay : lastDay;
  const days = bucketRange(from, to, 'day');
  return { days, series: seriesFor(keys ?? seriesKeys(meeting.reservations), days, rows) };
}

const HOUR = 3_600_000;

export type CumulativeCurve = {
  /** Het begin van elk interval, als UTC-tijdstip (`toISOString`). */
  keys: string[];
  /** Hoeveel er ingeschreven waren tot en met het einde van dat interval. */
  values: number[];
  /** De breedte van een interval in uren. */
  stepHours: number;
};

/**
 * Het totaal aantal inschrijvingen door de tijd, fijner dan per dag: zo zie je
 * het uur waarop een mail of story vertrok. Per uur zolang de periode
 * hoogstens een week is, daarna per drie of zes uur, zodat de lijn (en de tabel
 * eronder) leesbaar blijft wanneer een bureau weken op voorhand opent.
 *
 * De sleutels zijn UTC-tijdstippen en geen Brusselse uren: bij de overgang naar
 * wintertijd komt 02:00 twee keer voor, en dan zouden twee intervallen
 * dezelfde sleutel krijgen. De grafiek toont ze op de Brusselse klok. Brussel
 * verschuift enkel met hele uren, dus een interval dat op een heel UTC-uur
 * begint, begint ook op een heel Brussels uur.
 *
 * Zelfde as als {@link meetingCurve}: van het openen (of de eerste
 * inschrijving) tot het bureau, of tot nu als het nog moet komen. Een
 * reclamemoment (`promotions`) van voor het openen rekt de as naar achter op,
 * zodat de aankondiging zichtbaar blijft; een moment na het einde rekt ze niet
 * op, want dan zou de lijn een toekomst tonen die er nog niet is.
 */
export function cumulativeCurve(
  meeting: StatsMeeting,
  now: Date = new Date(),
  promotions: Date[] = []
): CumulativeCurve {
  const times = meeting.reservations.map((reservation) => reservation.createdAt.getTime()).sort((a, b) => a - b);
  if (times.length === 0) return { keys: [], values: [], stepHours: 1 };

  const first = Math.min(times[0], meeting.opensAt?.getTime() ?? times[0], ...promotions.map((at) => at.getTime()));
  const end = Math.max(times[times.length - 1], Math.min(now.getTime(), meeting.startsAt.getTime()));
  const spanHours = (end - first) / HOUR;
  const stepHours = spanHours <= 7 * 24 ? 1 : spanHours <= 21 * 24 ? 3 : 6;
  const step = stepHours * HOUR;
  // Op een veelvoud van de stap in UTC: met drie uur beginnen de intervallen
  // dan op 00, 03, 06 UTC, en niet op het toevallige uur van het openen.
  const start = Math.floor(first / step) * step;

  const keys: string[] = [];
  const values: number[] = [];
  let seen = 0;
  for (let t = start; t <= end; t += step) {
    while (seen < times.length && times[seen] < t + step) seen += 1;
    keys.push(new Date(t).toISOString());
    values.push(seen);
  }
  return { keys, values, stepHours };
}

/**
 * In welk interval van de lijn een tijdstip valt, of null wanneer het erbuiten
 * ligt (een moment na nu, of een bureau zonder inschrijvingen).
 */
export function curveIndex(curve: CumulativeCurve, at: Date): number | null {
  if (curve.keys.length === 0) return null;
  const step = curve.stepHours * HOUR;
  const start = Date.parse(curve.keys[0]);
  const index = Math.floor((at.getTime() - start) / step);
  return index >= 0 && index < curve.keys.length ? index : null;
}

export type SourceRow = {
  /** Een kanaal, of {@link UNMEASURED}. */
  key: string;
  count: number;
  share: number;
  firstAt: Date;
  campaigns: { key: string; count: number; share: number; firstAt: Date }[];
};

/**
 * Per kanaal hoeveel inschrijvingen, hun aandeel en wanneer de eerste
 * binnenkwam, met de campagnes (`?c=`) eronder. Een inschrijving zonder
 * campagne staat enkel in het totaal van haar kanaal.
 */
export function sourceRows(reservations: StatsReservation[]): SourceRow[] {
  const total = reservations.length;
  const groups = new Map<string, StatsReservation[]>();
  for (const reservation of reservations) {
    const key = keyOf(reservation);
    groups.set(key, [...(groups.get(key) ?? []), reservation]);
  }
  const earliest = (rows: StatsReservation[]) => new Date(Math.min(...rows.map((row) => row.createdAt.getTime())));

  return rankSources(countBy(reservations, keyOf)).map((key) => {
    const rows = groups.get(key) ?? [];
    const campaigns = new Map<string, StatsReservation[]>();
    for (const row of rows) {
      if (!row.sourceCampaign) continue;
      campaigns.set(row.sourceCampaign, [...(campaigns.get(row.sourceCampaign) ?? []), row]);
    }
    return {
      key,
      count: rows.length,
      share: total > 0 ? rows.length / total : 0,
      firstAt: earliest(rows),
      campaigns: [...campaigns.entries()]
        .map(([campaign, list]) => ({
          key: campaign,
          count: list.length,
          share: total > 0 ? list.length / total : 0,
          firstAt: earliest(list),
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    };
  });
}

export type YearOverview = {
  /** Per bureau de Brusselse dag, in de volgorde van de bureaus. */
  meetings: { id: string; day: string; total: number; newcomers: number; returning: number }[];
  series: Series[];
};

/**
 * Een staaf per bureau, gestapeld per herkomst, en per bureau nieuw tegenover
 * terugkerend. Terugkerend = stond ingeschreven op een eerder bureau uit deze
 * lijst. De beller geeft de bureaus van één werkingsjaar mee (vanaf 15 juli,
 * zoals de rechten), dus het eerste bureau van het jaar heeft enkel nieuwe
 * mensen. Omdat annuleren de rij wist, betekent "eerder" hier: stond op dat
 * bureau nog ingeschreven.
 */
export function yearOverview(meetings: StatsMeeting[]): YearOverview {
  const ordered = [...meetings].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const days = ordered.map((meeting) => meeting.id);
  const all = ordered.flatMap((meeting) => meeting.reservations);
  const rows = ordered.flatMap((meeting) =>
    meeting.reservations.map((reservation) => ({ bucket: meeting.id, key: keyOf(reservation) }))
  );

  const seen = new Set<string>();
  const perMeeting = ordered.map((meeting) => {
    const users = new Set(meeting.reservations.map((reservation) => reservation.userId));
    let returning = 0;
    for (const user of users) if (seen.has(user)) returning += 1;
    for (const user of users) seen.add(user);
    return {
      id: meeting.id,
      day: brusselsParts(meeting.startsAt).day,
      total: users.size,
      newcomers: users.size - returning,
      returning,
    };
  });

  return { meetings: perMeeting, series: seriesFor(seriesKeys(all), days, rows) };
}
