import Link from 'next/link';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import {
  chargesRequester,
  formatDateOnly,
  formatDateWithPart,
  formatEuro,
  isLastMinute,
  requesterLabel,
} from '@/lib/uitleen';
import {
  adminReservations,
  conflictingReservationIds,
  getLogistiekSettings,
  type AdminReservation,
} from '@/lib/uitleen-server';
import {
  BulkActionBar,
  BulkSelectionProvider,
  RowSelectCheckbox,
  SelectAllCheckbox,
} from './bulk-request-actions';

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

/**
 * "Materiaal", "Flesserke" of "Materiaal + Flesserke", op basis van welke
 * lijnen de aanvraag heeft (R3). Bij "aangevraagd" etc. stond nergens welk
 * type het was; dit maakt dat in één oogopslag duidelijk.
 */
function requestKindLabel(reservation: Pick<AdminReservation, 'lines' | 'flesserkeLines'>): string | null {
  const hasMaterial = reservation.lines.length > 0;
  const hasFlesserke = reservation.flesserkeLines.length > 0;
  if (hasMaterial && hasFlesserke) return 'Materiaal + Flesserke';
  if (hasMaterial) return 'Materiaal';
  if (hasFlesserke) return 'Flesserke';
  return null;
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

  const [all, settings, conflicting] = await Promise.all([
    adminReservations(),
    getLogistiekSettings(),
    conflictingReservationIds(),
  ]);
  const reservations = activeTab === 'all' ? all : all.filter((r) => r.requesterType === activeTab);

  const open = reservations.filter((r) => r.status === 'REQUESTED');
  const active = reservations.filter((r) => r.status === 'APPROVED' || r.status === 'PICKED_UP');
  const done = reservations.filter((r) => !['REQUESTED', 'APPROVED', 'PICKED_UP'].includes(r.status));

  // "Lopend" krijgt de bulk-selectie (N4); "Afgelopen" (de afgesloten
  // aanvragen: afgewezen, geannuleerd, teruggebracht) staat standaard
  // ingeklapt (R2). Beide berekend vóór de render, zodat zowel de sectiekop
  // als de rijen dezelfde volgorde gebruiken.
  const sortedActive = chosenSort ? sortReservations(active, activeSort, activeDir) : byNextPickup(active);
  const sortedDone = chosenSort ? sortReservations(done, activeSort, activeDir) : byLastTouched(done);

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

  function ReservationRow({
    reservation,
    selectable = false,
  }: {
    reservation: AdminReservation;
    /** Toont een checkbox voor de bulk-acties (N4); enkel in "Lopend". */
    selectable?: boolean;
  }) {
    const lastMinute =
      reservation.status === 'REQUESTED' &&
      isLastMinute(reservation.pickupDate, reservation.createdAt, settings.lastMinuteDays);
    const kind = requestKindLabel(reservation);
    // Enkel externen betalen (R4/chargesRequester): een post of werkgroep
    // factureert niet aan zichzelf, dus waarborg en bedrag verdwijnen hier
    // volledig in plaats van "€ 0,00" te tonen.
    const showDeposit = chargesRequester(reservation.requesterType) && reservation.totalDepositCents > 0;
    const row = (
      <Link
        href={`/beheer/aanvragen/${reservation.id}`}
        className={
          selectable
            ? 'logistics-admin-request-row logistics-admin-request-row--selectable min-w-0 flex-1'
            : 'logistics-admin-request-row'
        }
      >
        <div className="logistics-reservation-cell logistics-reservation-subject">
          <span>Aanvraag</span>
          <strong>{reservation.eventName}</strong>
          {/* `eventName` op de aanvraag is de momentopname die uit het gekozen
              evenement voorgevuld werd, dus meestal staat hier exact dezelfde
              naam als in de titel. Die regel op elke rij herhalen is ruis, en
              ruis leert de lezer ze over te slaan op de ene rij waar ze wél
              iets zegt. Vandaar enkel bij een hernoemd evenement (M8); dát het
              onder een evenement hangt, zegt de pill hieronder. */}
          {reservation.event && reservation.event.name !== reservation.eventName ? (
            <p className="mt-0.5">Evenement: {reservation.event.name}</p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
              {requesterLabel(reservation)}
            </span>
            {/* Hangt deze aanvraag onder een evenement? Dat was in deze lijst
                nergens te zien, terwijl het bepaalt of er nog materiaal,
                flesserke of transport bij hoort (M8). */}
            {reservation.event ? (
              <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                Evenement
              </span>
            ) : null}
            {kind ? (
              <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                {kind}
              </span>
            ) : null}
            {/* Al eens goedgekeurd en daarna aangepast door de aanvrager (M2):
                die staat weer in de wachtrij, maar met een andere inhoud dan
                waarover het team beslist had. */}
            {reservation.status === 'REQUESTED' && reservation.decidedAt ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Gewijzigd, opnieuw beslissen
              </span>
            ) : null}
            {lastMinute ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                Last minute
              </span>
            ) : null}
            {/* Deze aanvraag past niet naast wat al goedgekeurd is. Altijd
                opnieuw berekend: annuleert de andere partij, dan is het weg. */}
            {conflicting.has(reservation.id) ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Conflict
              </span>
            ) : null}
            {/* Een gevraagde levering stond nergens in deze lijst, dus ze werd
                pas opgemerkt door wie de aanvraag toevallig opende. Geel
                zolang er nog geen rit van gemaakt is. */}
            {reservation.delivery ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  reservation._count.transports > 0
                    ? 'bg-vtk-paper-2 text-vtk-navy'
                    : 'bg-vtk-yellow text-vtk-ink'
                }`}
              >
                {reservation._count.transports > 0 ? 'Levering gepland' : 'Levering'}
              </span>
            ) : null}
          </p>
        </div>
        <div className="logistics-reservation-cell">
          <span>Aanvrager</span>
          <p>{reservation.user.name}</p>
        </div>
        <div className="logistics-reservation-cell">
          <span>Inhoud</span>
          <p>{itemSummary(reservation.lines)}</p>
        </div>
        <div className="logistics-reservation-cell">
          <span>Periode</span>
          <p>
            {formatDateWithPart(reservation.pickupDate, reservation.pickupPart)} tot{' '}
            {formatDateWithPart(reservation.returnDate, reservation.returnPart)}
            {/* Interne aanvragen (post/werkgroep) betalen niet: geen waarborg
                tonen, niet "€ 0,00" (R4). */}
            {showDeposit ? `, ${formatEuro(reservation.totalDepositCents)} waarborg` : ''}
          </p>
        </div>
        <div className="logistics-reservation-status">
          <span>Status</span>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </Link>
    );

    if (!selectable) return <li>{row}</li>;
    return (
      <li className="flex items-center gap-3">
        <RowSelectCheckbox id={reservation.id} label={`Selecteer aanvraag: ${reservation.eventName}`} />
        {row}
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
          afhaling bovenaan. Afgelopen is historiek en gaat achterwaarts, op het
          moment waarop er nog iets aan veranderde (teruggebracht, afgewezen). */}
      <Section title="Te beslissen" list={open} fallback={byNextPickup} />

      {/* Bulk-acties (N4) horen enkel bij "Lopend": dat zijn de aanvragen die
          nog een overgang (afgehaald/teruggebracht) kunnen maken. De selectie
          leeft in een eigen provider, zodat ze niet per ongeluk rijen buiten
          deze sectie raakt. */}
      <BulkSelectionProvider
        flesserkeIds={sortedActive
          .filter((reservation) => reservation.flesserkeLines.length > 0)
          .map((reservation) => reservation.id)}
      >
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
              Lopend ({sortedActive.length})
            </h2>
            <SelectAllCheckbox ids={sortedActive.map((r) => r.id)} />
          </div>
          <div className="mt-3 empty:mt-0">
            <BulkActionBar />
          </div>
          {sortedActive.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">Niets hier.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {sortedActive.map((reservation) => (
                <ReservationRow key={reservation.id} reservation={reservation} selectable />
              ))}
            </ul>
          )}
        </section>
      </BulkSelectionProvider>

      {/* Afgelopen (R2): de aanvragen die niets meer nodig hebben (afgewezen,
          geannuleerd, teruggebracht) staan standaard ingeklapt zodat de
          actieve lijsten hierboven het overzicht blijven. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold tracking-tight text-vtk-ink [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="inline-block text-vtk-muted transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          Afgelopen ({sortedDone.length})
        </summary>
        {sortedDone.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Niets hier.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {sortedDone.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
