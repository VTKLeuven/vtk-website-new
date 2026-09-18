import Link from 'next/link';
import { requireManage } from '@/lib/session';
import { activeGroups, adminVehicles } from '@/lib/uitleen-server';
import {
  resolvePeriod,
  transportStats,
  workingYearLabel,
  type StatsPeriodKey,
} from '@/lib/uitleen-stats';
import { currentWorkingYear, FIRST_WORKING_YEAR } from '@vtk/auth';
import { parseDateOnly, toDateInputValue } from '@/lib/uitleen';
import { TransportCharts } from './charts';

/**
 * Wie reed er wanneer, hoelang en voor welke post (T11).
 *
 * Eén scherm en geen tabblad per vraag: de vragen hangen samen ("Onthaal vroeg
 * het meest vervoer" roept meteen "door wie werd dat gereden" op), en het
 * antwoord verschuift telkens je de periode verandert. De filters staan daarom
 * bovenaan en gelden voor alles eronder.
 *
 * De periode staat in de URL, zoals de filters van de planning: een link naar
 * "vorig werkingsjaar, enkel de kar" hoort deelbaar te zijn, en de terugknop
 * hoort te werken.
 *
 * **Wat dit scherm niet is: een afrekening.** Er staan geen bedragen, en de uren
 * zijn het geboekte venster en niet de tijd achter het stuur. Zie
 * `lib/uitleen-stats.ts`.
 */
const PERIODS: Array<{ key: StatsPeriodKey; label: string }> = [
  { key: 'jaar', label: 'Dit werkingsjaar' },
  { key: 'vorigjaar', label: 'Vorig werkingsjaar' },
  { key: 'maand', label: 'Laatste 30 dagen' },
  { key: 'aangepast', label: 'Aangepast' },
];

function isPeriodKey(value: string | undefined): value is StatsPeriodKey {
  return PERIODS.some((period) => period.key === value);
}

export default async function StatistiekenPage({
  searchParams,
}: {
  searchParams: Promise<{
    periode?: string;
    van?: string;
    tot?: string;
    voertuig?: string;
    post?: string;
  }>;
}) {
  await requireManage();
  const query = await searchParams;

  const vehicleIds = (query.voertuig ?? '').split(',').filter(Boolean);
  const groupIds = (query.post ?? '').split(',').filter(Boolean);
  const period = resolvePeriod(isPeriodKey(query.periode) ? query.periode : 'jaar', {
    from: query.van ? parseDateOnly(query.van) : null,
    to: query.tot ? parseDateOnly(query.tot) : null,
  });

  const [stats, vehicles, groups] = await Promise.all([
    transportStats({ from: period.from, to: period.to, vehicleIds, groupIds }),
    adminVehicles(),
    activeGroups(),
  ]);

  /** Dezelfde URL met één ding anders; de rest van de keuze blijft staan. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const current: Record<string, string | null> = {
      periode: period.key === 'jaar' ? null : period.key,
      van: query.van ?? null,
      tot: query.tot ?? null,
      voertuig: vehicleIds.join(',') || null,
      post: groupIds.join(',') || null,
      ...changes,
    };
    for (const [key, value] of Object.entries(current)) if (value) params.set(key, value);
    const search = params.toString();
    return search ? `/beheer/statistieken?${search}` : '/beheer/statistieken';
  };

  /** Een pil aan- of uitzetten in een lijst met id's. */
  const toggleHref = (key: 'voertuig' | 'post', ids: string[], id: string) => {
    const next = ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
    return hrefWith({ [key]: next.join(',') || null });
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm font-medium transition ${
      active
        ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
        : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
    }`;

  const previousYear = Math.max(currentWorkingYear() - 1, FIRST_WORKING_YEAR);

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Statistieken</h2>
        <p className="text-sm text-vtk-muted">
          {period.label} · {stats.totals.trips} ritten. De uren zijn het geboekte venster van een
          rit, niet de tijd achter het stuur.
        </p>
      </div>

      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5">
        <div className="grid gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
              Periode
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PERIODS.map((option) => (
                <Link
                  key={option.key}
                  href={hrefWith({ periode: option.key === 'jaar' ? null : option.key })}
                  aria-current={period.key === option.key ? 'true' : undefined}
                  className={chip(period.key === option.key)}
                >
                  {option.key === 'jaar'
                    ? `Werkingsjaar ${workingYearLabel(currentWorkingYear())}`
                    : option.key === 'vorigjaar'
                      ? `Werkingsjaar ${workingYearLabel(previousYear)}`
                      : option.label}
                </Link>
              ))}
            </div>
            {period.key === 'aangepast' ? (
              // Een gewoon formulier met een GET: het zet twee datums in de
              // querystring, en daar hoort geen server action bij.
              <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="periode" value="aangepast" />
                {vehicleIds.length > 0 ? (
                  <input type="hidden" name="voertuig" value={vehicleIds.join(',')} />
                ) : null}
                {groupIds.length > 0 ? (
                  <input type="hidden" name="post" value={groupIds.join(',')} />
                ) : null}
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Van
                  <input
                    type="date"
                    name="van"
                    defaultValue={query.van ?? toDateInputValue(period.from)}
                    className="h-9 rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Tot en met
                  <input
                    type="date"
                    name="tot"
                    defaultValue={query.tot ?? toDateInputValue(new Date(period.to.getTime() - 86_400_000))}
                    className="h-9 rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink"
                  />
                </label>
                <button
                  type="submit"
                  className="h-9 rounded-full border border-vtk-navy bg-vtk-navy px-3.5 text-sm font-semibold text-vtk-on-emphasis transition hover:bg-vtk-ink"
                >
                  Toon
                </button>
              </form>
            ) : null}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
              Voertuig{vehicleIds.length === 0 ? <span className="ml-1.5 font-normal normal-case">alle</span> : null}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {vehicles.map((vehicle) => (
                <Link
                  key={vehicle.id}
                  href={toggleHref('voertuig', vehicleIds, vehicle.id)}
                  className={chip(vehicleIds.includes(vehicle.id))}
                >
                  {vehicle.nameNl}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
              Post of werkgroep
              {groupIds.length === 0 ? <span className="ml-1.5 font-normal normal-case">alle</span> : null}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={toggleHref('post', groupIds, group.id)}
                  className={chip(groupIds.includes(group.id))}
                >
                  {group.nameNl}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TransportCharts stats={stats} periodLabel={period.label} />
    </div>
  );
}
