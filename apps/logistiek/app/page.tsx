import Link from '@vtk/ui/link';
import { ExternClosed } from '@/components/extern-closed';
import { LoginGate } from '@/components/login-gate';
import { LogisticsIcon } from '@/components/logistics-icon';
import { PageShell } from '@/components/page-shell';
import { ReservationStatusBadge, VanStatusBadge } from '@/components/status-badge';
import { externalRequestsBlocked, getSession, requestsAsExternal } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';
import { formatDateOnly, formatDateTime, tripTitle } from '@/lib/uitleen';
import { driverStatus, getLogistiekSettings, memberStartOverview, showsMyTrips } from '@/lib/uitleen-server';

/**
 * De startpagina van een lid: wat er loopt, en dan pas wat er kan (C1 uit de
 * audit van november 2026).
 *
 * Ze opende met "Alles wat je nodig hebt", drie kaarten die de navigatie
 * herhaalden, een rij "Zo werkt het" in drie icoontjes en een band "Goed
 * geregeld" die halverwege een zin afbrak (L4). Niets daarvan vertelde een lid
 * dat terugkomt iets wat het niet al wist. Nu eerst zijn openstaande aanvragen
 * met hun status, dan de ritten die hij rijdt, en dan drie compacte knoppen om
 * iets nieuws aan te vragen.
 */
export default async function LogistiekHome() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return <LoginGate />;

  const t = copy[locale];
  const en = locale === 'en';
  const groupIds = session.groups.map((group) => group.id);
  const [content, driver, settings, overview] = await Promise.all([
    getPublicCopy(locale),
    driverStatus(session.user.id, groupIds),
    getLogistiekSettings(),
    memberStartOverview(session.user.id, groupIds),
  ]);
  // S1: het zegt het hier al, zodat niemand eerst een formulier invult om pas
  // bij de indienknop te ontdekken dat het nog dicht staat.
  const blocked = externalRequestsBlocked(session, settings);

  // Materiaal en ritten in één lijst, op hun eerste dag: zo staat bovenaan wat
  // het eerst komt, wat het ook is.
  const open = [
    ...overview.reservations.map((reservation) => ({
      key: `r-${reservation.id}`,
      href: `/reservaties/${reservation.id}`,
      at: reservation.pickupDate.getTime(),
      icon: 'material' as const,
      title: reservation.eventName,
      when: `${formatDateOnly(reservation.pickupDate, locale)} - ${formatDateOnly(reservation.returnDate, locale)}`,
      badge: <ReservationStatusBadge status={reservation.status} locale={locale} />,
    })),
    ...overview.trips.map((trip) => ({
      key: `t-${trip.id}`,
      href: `/vervoer/${trip.id}`,
      at: trip.startAt.getTime(),
      icon: 'van' as const,
      title: tripTitle(trip),
      when: `${formatDateTime(trip.startAt, locale)} · ${en ? trip.vehicle.nameEn : trip.vehicle.nameNl}`,
      badge: <VanStatusBadge status={trip.status} locale={locale} />,
    })),
  ].sort((a, b) => a.at - b.at);
  const openTotal = overview.reservationCount + overview.tripCount;

  const actions = [
    { href: '/materiaal', icon: 'material' as const, title: t.homeMaterial, lead: content.homeMaterialLead },
    { href: '/vervoer', icon: 'van' as const, title: t.homeVan, lead: content.homeVanLead },
    // Flesserke enkel voor wie bij een post of werkgroep hoort: het is er enkel
    // voor de interne werking, en een knop die een externe naar een geweigerd
    // formulier stuurt, helpt niemand.
    ...(requestsAsExternal(session)
      ? []
      : [
          {
            href: '/flesserke',
            icon: 'bottle' as const,
            title: t.navFlesserke,
            lead: en ? 'Drinks and supplies for an activity of your post.' : 'Drank en verbruik voor een activiteit van je post.',
          },
        ]),
  ];

  return (
    <PageShell kicker={t.loginKicker} title={t.loginTitle}>
      <div className="grid gap-9">
        {blocked ? <ExternClosed locale={locale} /> : null}

        <section aria-labelledby="home-open">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="home-open" className="text-lg font-semibold tracking-tight text-vtk-ink">
              {t.navReservations}
            </h2>
            <Link
              href="/reservaties"
              className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow decoration-2 underline-offset-4"
            >
              {en ? `All requests${openTotal > 0 ? ` (${openTotal} open)` : ''}` : `Alle aanvragen${openTotal > 0 ? ` (${openTotal} open)` : ''}`}
            </Link>
          </div>
          {open.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {en
                ? 'Nothing open right now. What you request appears here with its status.'
                : 'Je hebt niets openstaan. Wat je aanvraagt, staat hier met zijn status.'}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {open.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3 transition hover:border-vtk-navy/25"
                  >
                    <LogisticsIcon name={item.icon} className="h-5 w-5 shrink-0 text-vtk-navy" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-vtk-ink">{item.title}</span>
                      <span className="block truncate text-sm text-vtk-muted">{item.when}</span>
                    </span>
                    <span className="shrink-0">{item.badge}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {showsMyTrips(driver) ? (
          <section aria-labelledby="home-trips">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="home-trips" className="text-lg font-semibold tracking-tight text-vtk-ink">
                {t.navTrips}
              </h2>
              <Link
                href="/ritten"
                className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow decoration-2 underline-offset-4"
              >
                {en ? 'All my trips' : 'Al mijn ritten'}
              </Link>
            </div>
            {overview.driving.length === 0 ? (
              <p className="mt-3 text-sm text-vtk-muted">
                {en ? 'No trips assigned to you or your post.' : 'Geen ritten op jouw naam of die van je post.'}
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {overview.driving.map((trip) => (
                  <li key={trip.id}>
                    <Link
                      href={`/ritten#rit-${trip.id}`}
                      className="flex items-center gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3 transition hover:border-vtk-navy/25"
                    >
                      <LogisticsIcon name="van" className="h-5 w-5 shrink-0 text-vtk-navy" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-vtk-ink">{tripTitle(trip)}</span>
                        <span className="block truncate text-sm text-vtk-muted">
                          {formatDateTime(trip.startAt, locale)} · {en ? trip.vehicle.nameEn : trip.vehicle.nameNl}
                          {trip.driverId === session.user.id ? '' : en ? ' · your post picks a driver' : ' · je post kiest de chauffeur'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-labelledby="home-new">
          <h2 id="home-new" className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Request something' : 'Iets aanvragen'}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {actions.map((action) => (
              <li key={action.href}>
                <Link
                  href={action.href}
                  className="flex h-full items-start gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3 transition hover:border-vtk-navy/25"
                >
                  <LogisticsIcon name={action.icon} className="mt-0.5 h-5 w-5 shrink-0 text-vtk-navy" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-vtk-ink">{action.title}</span>
                    <span className="mt-0.5 block text-sm leading-6 text-vtk-muted">{action.lead}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
