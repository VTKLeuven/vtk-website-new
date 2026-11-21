import { Suspense, type ReactNode } from 'react';
import Link from '@vtk/ui/link';
import { currentWorkingYear } from '@vtk/auth';
import { requireManage } from '@/lib/session';
import { SortChipLinks, nextSortDir, type SortDir } from '@/app/beheer/sort';
import { TRIP_SORTS, compareTrips, isTripSort, type TripSort } from '@/lib/transport-sort';
import { LogisticsIcon } from '@/components/logistics-icon';
import { ScrollToRit } from '@/components/scroll-to-rit';
import {
  TRIP_ARCHIVE_PAGE_SIZE,
  adminTransportArchive,
  adminTransportOpen,
  adminTransportYears,
  driverOptions,
  teamEditsForTransport,
  type AdminTripRow,
} from '@/lib/uitleen-server';
import { TripPanel } from './trip-panel';
import { TripRow, TripRowHeader, type TripBadge } from './trip-row';

/**
 * Ritaanvragen: open werk bovenaan, het archief per werkingsjaar eronder.
 *
 * De lijst toont enkel rijen; het paneel van één rit (beslissen, chauffeur,
 * historiek) opent met `?rit=<id>` en wordt enkel voor die rit gerenderd. Zie
 * `trip-row.tsx` en `trip-panel.tsx` voor het waarom (P1, M1, L2 uit de audit
 * van november 2026), en docs/design-decisions.md.
 */
type SearchParams = {
  rit?: string;
  sorteer?: string;
  richting?: string;
  jaar?: string;
  pagina?: string;
};

const TOOLBAR_LINKS = [
  { href: '/beheer/vervoer/week', label: 'Weekplanning', title: 'Weekraster per voertuig, met beheeracties' },
  { href: '/vervoer/bezetting', label: 'Bezetting', title: 'De publieke bezetting, met enkel de goedgekeurde ritten' },
];

/** Wacht deze rit nog op een chauffeur? Enkel wanneer Logistiek het voertuig rijdt (T13). */
function awaitsDriver(trip: Pick<AdminTripRow, 'driverId' | 'vehicle'>): boolean {
  return trip.vehicle.needsDriver && trip.driverId === null;
}

export default async function BeheerVervoerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireManage();
  const params = await searchParams;
  const { rit, sorteer, richting } = params;

  const chosenSort = isTripSort(sorteer) ? sorteer : null;
  const sort: TripSort = chosenSort ?? 'datum';
  const dir: SortDir = richting === 'asc' || richting === 'desc' ? richting : TRIP_SORTS[sort].defaultDir;
  const byChoice = (a: AdminTripRow, b: AdminTripRow) => compareTrips(a, b, sort, dir);

  const thisYear = currentWorkingYear();
  const parsedYear = Number(params.jaar);
  const archiveYear = Number.isInteger(parsedYear) && parsedYear > 2000 ? parsedYear : thisYear;
  const parsedPage = Number(params.pagina);
  const archivePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [open, archive, years, drivers] = await Promise.all([
    adminTransportOpen(),
    adminTransportArchive(archiveYear, archivePage),
    adminTransportYears(),
    driverOptions(),
  ]);
  const teamEdits = await teamEditsForTransport(
    [...open, ...archive.rows].map((trip) => ({ id: trip.id, userId: trip.userId }))
  );

  // Heen en terug zijn twee boekingen maar één aanvraag: het team beslist er in
  // één keer over, dus staan ze als één rij. De sortering bepaalt waar de groep
  // staat; de rij toont de eerste helft.
  const requested = open.filter((trip) => trip.status === 'REQUESTED').sort(byChoice);
  const requestedGroups: AdminTripRow[][] = [];
  const seen = new Set<string>();
  for (const trip of requested) {
    if (!trip.tripGroupId) {
      requestedGroups.push([trip]);
      continue;
    }
    if (seen.has(trip.tripGroupId)) continue;
    seen.add(trip.tripGroupId);
    requestedGroups.push(
      requested
        .filter((other) => other.tripGroupId === trip.tripGroupId)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    );
  }
  const approved = open.filter((trip) => trip.status === 'APPROVED').sort(byChoice);
  const unpaid = open.filter((trip) => trip.status === 'COMPLETED').sort(byChoice);

  /** Een adres op deze pagina met dezelfde sortering en archiefkeuze. */
  function hrefWith(changes: Partial<Record<keyof SearchParams, string | null>>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined | null> = { ...params, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/beheer/vervoer?${query}` : '/beheer/vervoer';
  }
  const closeHref = hrefWith({ rit: null });
  const sortOptions = (Object.keys(TRIP_SORTS) as TripSort[]).map((key) => ({
    key,
    label: TRIP_SORTS[key].label,
    href: sortHref(key),
  }));

  function sortHref(key: TripSort): string {
    return hrefWith({
      sorteer: key,
      richting: nextSortDir(key, chosenSort, dir, TRIP_SORTS[key].defaultDir),
    });
  }

  function badgesFor(trip: AdminTripRow, group: AdminTripRow[] = [trip]): TripBadge[] {
    const badges: TripBadge[] = [];
    if (trip.reservation) badges.push({ label: 'Levering', tone: 'quiet' });
    // Al eens goedgekeurd en daarna aangepast door de aanvrager (T5): de uren
    // waarover beslist was, zijn niet meer de uren die er nu staan.
    if (trip.status === 'REQUESTED' && trip.decidedAt) {
      badges.push({ label: 'Gewijzigd, opnieuw beslissen', tone: 'warn' });
    }
    if (group.some((leg) => (teamEdits.get(leg.id) ?? []).length > 0)) {
      badges.push({ label: 'Gewijzigd t.o.v. aanvraag', tone: 'yellow' });
    }
    if (trip.status === 'APPROVED' && awaitsDriver(trip)) {
      badges.push({ label: 'Nog geen chauffeur', tone: 'warn' });
    }
    return badges;
  }

  /** Het paneel van de gekozen rit; het komt onder zijn rij (zie `rowsWithPanel`). */
  const panel = rit ? (
    <li key={`panel-${rit}`} className="list-none">
      <Suspense
        fallback={
          <div className="my-3 h-40 rounded-[18px] border border-vtk-navy/10 bg-vtk-surface motion-safe:animate-pulse" />
        }
      >
        <TripPanel id={rit} closeHref={closeHref} />
      </Suspense>
    </li>
  ) : null;

  function rowsWithPanel(rows: Array<{ ids: string[]; node: ReactNode }>) {
    const out: ReactNode[] = [];
    for (const row of rows) {
      out.push(row.node);
      if (rit && row.ids.includes(rit)) out.push(panel);
    }
    return out;
  }

  const requestedRows = rowsWithPanel(
    requestedGroups.map((group) => {
      const [first] = group;
      return {
        ids: group.map((leg) => leg.id),
        node: (
          <TripRow
            key={first.id}
            trip={first}
            href={hrefWith({ rit: first.id })}
            selected={group.some((leg) => leg.id === rit)}
            extraLegs={first.tripLeg ? 0 : group.length - 1}
            showDriver={false}
            showStatus={false}
            badges={badgesFor(first, group)}
          />
        ),
      };
    })
  );
  const rowsFor = (list: AdminTripRow[], options: { showStatus: boolean }) =>
    rowsWithPanel(
      list.map((trip) => ({
        ids: [trip.id],
        node: (
          <TripRow
            key={trip.id}
            trip={trip}
            href={hrefWith({ rit: trip.id })}
            selected={trip.id === rit}
            showStatus={options.showStatus}
            badges={badgesFor(trip)}
          />
        ),
      }))
    );
  const approvedRows = rowsFor(approved, { showStatus: false });
  const unpaidRows = rowsFor(unpaid, { showStatus: false });
  const archiveRows = rowsFor(archive.rows, { showStatus: true });

  const firstShown = (archive.page - 1) * TRIP_ARCHIVE_PAGE_SIZE + 1;
  const lastShown = firstShown + archive.rows.length - 1;

  return (
    <div className="grid gap-7">
      {/* Vanuit de kalender kom je met ?rit=<id> binnen; dit brengt de rit in beeld (S3). */}
      <ScrollToRit id={rit} />

      {/* Een rit die in geen van de lijsten hieronder staat (een ander jaar of
          een andere pagina van het archief): dan opent het paneel hier. */}
      {rit && !shownIn(rit, [requestedGroups.flat(), approved, unpaid, archive.rows]) ? (
        <ul>{panel}</ul>
      ) : null}

      {/* Eén werkbalk (M2). Op een telefoon stonden hier vier rijen knoppen en
          sorteerpillen voor de eerste rit; daar blijft enkel wat je dagelijks
          nodig hebt zichtbaar, en de rest zit achter "Meer" en "Sorteren". */}
      <div className="flex flex-wrap items-center gap-2">
        {/* "Mijn beschikbaarheid" is de enige gevulde knop: het enige scherm
            hier waar je zelf iets invult. */}
        <Link
          href="/ritten/beschikbaarheid"
          title="Doorgeven wanneer je zelf kan rijden"
          className="inline-flex items-center gap-2 rounded-full bg-vtk-navy px-3.5 py-1.5 text-sm font-semibold text-vtk-on-emphasis transition hover:bg-vtk-navy/90"
        >
          <LogisticsIcon name="driver" className="h-4 w-4" />
          Mijn beschikbaarheid
        </Link>
        {TOOLBAR_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={link.title}
            className="hidden rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 sm:inline-flex"
          >
            {link.label}
          </Link>
        ))}
        <details className="relative sm:hidden">
          <summary className="cursor-pointer list-none rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
            Meer
          </summary>
          <div className="absolute left-0 top-full z-30 mt-2 grid min-w-48 gap-1 rounded-[14px] border border-vtk-navy/15 bg-vtk-surface p-2 shadow-lg">
            {[...TOOLBAR_LINKS, { href: '/beheer/chauffeurs', label: 'Chauffeurs beheren', title: '' }].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-vtk-ink hover:bg-vtk-navy/5"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </details>
        <details className="sm:hidden">
          <summary className="cursor-pointer list-none rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
            Sorteren
          </summary>
          <div className="mt-2">
            <SortChipLinks activeKey={chosenSort} dir={dir} options={sortOptions} />
          </div>
        </details>
        <p className="ml-auto hidden text-sm text-vtk-muted sm:block">
          {drivers.length === 0
            ? 'Nog niemand in de chauffeurslijst. '
            : `${drivers.length} chauffeur${drivers.length === 1 ? '' : 's'}. `}
          <Link
            href="/beheer/chauffeurs"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Beheren
          </Link>
        </p>
      </div>

      {/* Sorteren geldt voor het open werk; het archief staat altijd nieuwste eerst. */}
      <div className="hidden sm:block">
        <SortChipLinks activeKey={chosenSort} dir={dir} options={sortOptions} />
      </div>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Te beslissen ({requestedGroups.length})</h2>
        {requestedGroups.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen open ritaanvragen.</p>
        ) : (
          <div className="mt-3">
            <TripRowHeader showDriver={false} showStatus={false} />
            <ul>{requestedRows}</ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Goedgekeurd ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen goedgekeurde ritten.</p>
        ) : (
          <div className="mt-3">
            <TripRowHeader showStatus={false} />
            <ul>{approvedRows}</ul>
          </div>
        )}
      </section>

      {unpaid.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Gereden, nog niet betaald ({unpaid.length})</h2>
          <div className="mt-3">
            <TripRowHeader showStatus={false} />
            <ul>{unpaidRows}</ul>
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Archief</h2>
          {years.length > 1 ? (
            <nav aria-label="Werkingsjaar" className="flex flex-wrap gap-1.5">
              {years.map((year) => (
                <Link
                  key={year}
                  href={hrefWith({ jaar: year === thisYear ? null : String(year), pagina: null, rit: null })}
                  aria-current={year === archiveYear ? 'true' : undefined}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                    year === archiveYear
                      ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
                      : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
                  }`}
                >
                  {`${String(year).slice(2)}-${String(year + 1).slice(2)}`}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-vtk-muted">
          Afgerond, afgewezen en geannuleerd in werkingsjaar {String(archiveYear).slice(2)}-
          {String(archiveYear + 1).slice(2)}, nieuwste eerst.
          {archive.total > 0
            ? ` ${firstShown}${lastShown > firstShown ? ` tot ${lastShown}` : ''} van ${archive.total}.`
            : ''}
        </p>
        {archive.total === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Nog niets in het archief van dit jaar.</p>
        ) : (
          <div className="mt-3">
            <TripRowHeader />
            <ul>{archiveRows}</ul>
            {archive.pageCount > 1 ? (
              <nav aria-label="Pagina's van het archief" className="mt-3 flex items-center gap-2 text-sm">
                {archive.page > 1 ? (
                  <Link
                    href={hrefWith({ pagina: String(archive.page - 1), rit: null })}
                    className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
                  >
                    ← Nieuwer
                  </Link>
                ) : null}
                <span className="tabular-nums text-vtk-muted">
                  Pagina {archive.page} van {archive.pageCount}
                </span>
                {archive.page < archive.pageCount ? (
                  <Link
                    href={hrefWith({ pagina: String(archive.page + 1), rit: null })}
                    className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
                  >
                    Ouder →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

/** Of de gekozen rit in een van de getoonde lijsten staat. */
function shownIn(rit: string, lists: AdminTripRow[][]): boolean {
  return lists.some((list) => list.some((trip) => trip.id === rit));
}
