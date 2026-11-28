import Link from '@vtk/ui/link';
import { requireManage } from '@/lib/session';
import { activeGroups, adminVehicles, getLogistiekSettings } from '@/lib/uitleen-server';
import {
  resolvePeriod,
  transportStats,
  workingYearLabel,
  type StatsPeriodKey,
} from '@/lib/uitleen-stats';
import { currentWorkingYear, FIRST_WORKING_YEAR } from '@vtk/auth';
import { parseDateOnly, toDateInputValue } from '@/lib/uitleen';
import { TransportCharts } from './charts';
import { Disclosure } from '@/components/disclosure';

export const metadata = { title: 'Statistieken' };

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

  const settings = await getLogistiekSettings();
  const [stats, vehicles, groups] = await Promise.all([
    transportStats({
      from: period.from,
      to: period.to,
      vehicleIds,
      groupIds,
      maxTripHours: settings.statsMaxTripHours,
    }),
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

  const toggleHref = (key: 'voertuig' | 'post', ids: string[], id: string) => {
    const next = ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
    return hrefWith({ [key]: next.join(',') || null });
  };

  // Op een telefoon 40 px hoog (M4): de chips waren 28 px, en wie een post
  // aantikte, raakte even vaak de buur.
  const chip = (active: boolean) =>
    `inline-flex min-h-control items-center rounded-pill border px-3 py-1 text-sm font-medium transition md:min-h-0 ${
      active
        ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
        : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
    }`;

  const chosenGroups = groups.filter((group) => groupIds.includes(group.id));

  const thisYear = currentWorkingYear();
  const previousYear = thisYear - 1;
  // In het eerste werkingsjaar is er geen vorig jaar: die chip was dan een
  // tweede "Werkingsjaar 26-27" die naar precies hetzelfde scherm leidde.
  const periods = PERIODS.filter((option) => option.key !== 'vorigjaar' || thisYear > FIRST_WORKING_YEAR);

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Statistieken</h2>
        <p className="text-sm text-vtk-muted">
          {period.label} · {stats.totals.trips} ritten. De uren zijn het geboekte venster van een
          rit, niet de tijd achter het stuur. Een rit langer dan {stats.maxTripHours} uur telt niet
          mee, want zo lang rijdt niemand
          {stats.totals.tooLong === 1
            ? '; dat is er 1 in deze periode, en die staat onderaan met "telt niet mee"'
            : stats.totals.tooLong > 1
              ? `; dat zijn er ${stats.totals.tooLong} in deze periode, en ze staan onderaan met "telt niet mee"`
              : ''}
          .{' '}
          <Link
            href="/beheer/instellingen"
            className="font-medium text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Grens aanpassen
          </Link>
        </p>
      </div>

      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5">
        <div className="grid gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-vtk-muted">Periode</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {periods.map((option) => (
                <Link
                  key={option.key}
                  href={hrefWith({ periode: option.key === 'jaar' ? null : option.key })}
                  aria-current={period.key === option.key ? 'true' : undefined}
                  className={chip(period.key === option.key)}
                >
                  {option.key === 'jaar'
                    ? `Werkingsjaar ${workingYearLabel(thisYear)}`
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
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-vtk-muted">
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

          {/* Twintig posten en werkgroepen als chips waren op een telefoon een
              half scherm (M4). Dicht, met in de kop wat er gekozen is; open
              zodra er iets gekozen is, want dan wil je het zien. */}
          <Disclosure
            variant="plain"
            open={groupIds.length > 0}
            title="Post of werkgroep"
            summary={
              chosenGroups.length === 0
                ? 'Alle posten en werkgroepen'
                : chosenGroups.map((group) => group.nameNl).join(', ')
            }
          >
            <div className="flex flex-wrap gap-1.5">
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
          </Disclosure>
        </div>
      </section>

      <TransportCharts stats={stats} periodLabel={period.label} />
    </div>
  );
}
