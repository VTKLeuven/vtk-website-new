import Link from 'next/link';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { formatDateOnly, formatEuro, isLastMinute, requesterLabel } from '@/lib/uitleen';
import { adminReservations, type AdminReservation } from '@/lib/uitleen-server';

const TABS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'INTERN', label: 'Interne posten' },
  { value: 'WERKGROEP', label: 'Werkgroepen' },
  { value: 'EXTERN', label: 'Externen' },
];

/**
 * Waarop het team de wachtrij kan sorteren. De volgorde die er het meest toe
 * doet is de afhaaldatum: wat eerst uit de loods moet, hoort bovenaan. Op
 * aanvraagdatum (de oude vaste volgorde) staat wat gisteren binnenkwam bovenaan,
 * ook als het pas over twee maanden afgehaald wordt.
 */
const SORTS = {
  pickup: { label: 'Afhaaldatum', defaultDir: 'asc' as const },
  created: { label: 'Aanvraagdatum', defaultDir: 'desc' as const },
  requester: { label: 'Post', defaultDir: 'asc' as const },
};
type SortKey = keyof typeof SORTS;
type SortDir = 'asc' | 'desc';

function isSortKey(value: string | undefined): value is SortKey {
  return value !== undefined && value in SORTS;
}

function sortReservations(
  list: AdminReservation[],
  key: SortKey,
  dir: SortDir
): AdminReservation[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    switch (key) {
      case 'created':
        return factor * (a.createdAt.getTime() - b.createdAt.getTime());
      case 'requester':
        return factor * requesterLabel(a).localeCompare(requesterLabel(b), 'nl-BE');
      case 'pickup':
      default:
        // Gelijke dag: de vroegst aangevraagde eerst, zodat de volgorde stabiel
        // is en niet per herlaadbeurt wisselt.
        return (
          factor * (a.pickupDate.getTime() - b.pickupDate.getTime()) ||
          a.createdAt.getTime() - b.createdAt.getTime()
        );
    }
  });
}

const byNextPickup = (list: AdminReservation[]) => sortReservations(list, 'pickup', 'asc');

const byLastTouched = (list: AdminReservation[]) =>
  [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

/** Compacte opsomming: drie items, de rest geteld. Zie de lijst zelf voor waarom. */
function itemSummary(lines: AdminReservation['lines']): string {
  const shown = lines.slice(0, 3).map((line) => `${line.quantity}× ${line.itemName}`);
  const rest = lines.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} en ${rest} andere` : shown.join(', ');
}

export default async function BeheerAanvragenPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; dir?: string }>;
}) {
  await requireManage();
  const { type, sort, dir } = await searchParams;
  const activeTab = TABS.some((t) => t.value === type) ? type! : 'all';

  // Zonder expliciete keuze krijgt elke sectie haar eigen logische volgorde:
  // wat nog moet gebeuren chronologisch vooruit, wat gebeurd is achterwaarts.
  const chosenSort = isSortKey(sort) ? sort : null;
  const chosenDir: SortDir | null = dir === 'asc' || dir === 'desc' ? dir : null;
  const activeSort: SortKey = chosenSort ?? 'pickup';
  const activeDir: SortDir = chosenDir ?? SORTS[activeSort].defaultDir;

  const all = await adminReservations();
  const reservations = activeTab === 'all' ? all : all.filter((r) => r.requesterType === activeTab);

  const open = reservations.filter((r) => r.status === 'REQUESTED');
  const active = reservations.filter((r) => r.status === 'APPROVED' || r.status === 'PICKED_UP');
  const done = reservations.filter((r) => !['REQUESTED', 'APPROVED', 'PICKED_UP'].includes(r.status));

  function sortLink(key: SortKey): string {
    // Klikken op de actieve sortering draait de richting om.
    const nextDir: SortDir = activeSort === key && activeDir === 'asc' ? 'desc' : 'asc';
    const params = new URLSearchParams();
    if (activeTab !== 'all') params.set('type', activeTab);
    params.set('sort', key);
    params.set('dir', nextDir);
    return `/beheer/aanvragen?${params.toString()}`;
  }

  function tabLink(value: string): string {
    const params = new URLSearchParams();
    if (value !== 'all') params.set('type', value);
    if (chosenSort) params.set('sort', chosenSort);
    if (chosenDir) params.set('dir', chosenDir);
    const query = params.toString();
    return query ? `/beheer/aanvragen?${query}` : '/beheer/aanvragen';
  }

  function ReservationRow({ reservation }: { reservation: AdminReservation }) {
    const lastMinute =
      reservation.status === 'REQUESTED' && isLastMinute(reservation.pickupDate, reservation.createdAt);
    return (
      <li>
        {/* Vaste twee kolommen: met flex-wrap sprong de badge naar een eigen
            lijn zodra de itemopsomming lang werd, en dan verspringt de hele rij. */}
        <Link
          href={`/beheer/aanvragen/${reservation.id}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3 transition hover:border-vtk-navy/25"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
              <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                {requesterLabel(reservation)}
              </span>
              {reservation.eventName}
              {lastMinute ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Last minute
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-sm text-vtk-muted">
              {reservation.user.name} · {itemSummary(reservation.lines)}
            </p>
            <p className="mt-0.5 truncate text-sm text-vtk-muted">
              {formatDateOnly(reservation.pickupDate)} tot {formatDateOnly(reservation.returnDate)}
              {reservation.totalDepositCents > 0
                ? ` · ${formatEuro(reservation.totalDepositCents)} waarborg`
                : ''}
            </p>
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </Link>
      </li>
    );
  }

  function Section({
    title,
    list,
    fallback,
  }: {
    title: string;
    list: AdminReservation[];
    /** Volgorde zolang het team zelf niets koos. */
    fallback: (list: AdminReservation[]) => AdminReservation[];
  }) {
    const sorted = chosenSort ? sortReservations(list, activeSort, activeDir) : fallback(list);
    return (
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          {title} ({sorted.length})
        </h2>
        {sorted.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Niets hier.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {sorted.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filter op aanvrager">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={tabLink(tab.value)}
              aria-current={activeTab === tab.value ? 'page' : undefined}
              className={
                activeTab === tab.value
                  ? 'rounded-full bg-vtk-navy px-4 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-vtk-navy/15 px-4 py-1.5 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40'
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Sorteren">
          <span className="text-vtk-muted">Sorteren op</span>
          {(Object.keys(SORTS) as SortKey[]).map((key) => {
            const isActive = chosenSort === key;
            return (
              <Link
                key={key}
                href={sortLink(key)}
                aria-current={isActive ? 'true' : undefined}
                className={
                  isActive
                    ? 'inline-flex items-center gap-1 rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1 font-semibold text-white'
                    : 'inline-flex items-center gap-1 rounded-full border border-vtk-navy/15 px-3 py-1 font-medium text-vtk-ink transition hover:border-vtk-navy/40'
                }
              >
                {SORTS[key].label}
                {isActive ? <span aria-hidden="true">{activeDir === 'asc' ? '↑' : '↓'}</span> : null}
                {isActive ? (
                  <span className="sr-only">
                    {activeDir === 'asc' ? '(oplopend)' : '(aflopend)'}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Wat nog moet gebeuren staat chronologisch vooruit: de eerstvolgende
          afhaling bovenaan. Afgerond is historiek en gaat achterwaarts, op het
          moment waarop er nog iets aan veranderde (teruggebracht, afgewezen). */}
      <Section title="Te beslissen" list={open} fallback={byNextPickup} />
      <Section title="Lopend" list={active} fallback={byNextPickup} />
      <Section title="Afgerond" list={done} fallback={byLastTouched} />
    </div>
  );
}
