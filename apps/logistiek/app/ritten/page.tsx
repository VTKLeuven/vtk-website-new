import Link from 'next/link';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { PhoneLink } from '@/components/phone-link';
import { copy, getLocale } from '@/lib/i18n';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/uitleen';
import { feedTokensForUser, isDriver, tripsForDriver, type DriverTrip } from '@/lib/uitleen-server';
import { FeedTokens } from '@/components/feed-tokens';
import { ToastProvider } from '@/components/ui/toast';
import type { LogistiekLocale } from '@/lib/i18n-shared';

function TripCard({ trip, locale, past }: { trip: DriverTrip; locale: LogistiekLocale; past: boolean }) {
  const en = locale === 'en';
  const vehicle = en ? trip.vehicle.nameEn : trip.vehicle.nameNl;
  const requesterGroup = trip.group ? (en ? trip.group.nameEn : trip.group.nameNl) : null;

  return (
    <li
      className={`rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 ${past ? 'opacity-75' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
              {vehicle}
            </span>
            <span className="font-medium text-vtk-ink">{trip.purpose}</span>
          </p>
          <p className="mt-1 text-sm text-vtk-muted">
            {formatDateTime(trip.startAt, locale)} {en ? 'to' : 'tot'} {formatDateTime(trip.endAt, locale)}
          </p>
        </div>
        {trip.status === 'COMPLETED' ? (
          <span className="rounded-full bg-vtk-navy/8 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
            {en ? 'Completed' : 'Afgerond'}
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {trip.pickupAddress ? (
          <div>
            <dt className="text-vtk-muted">{en ? 'Loading address' : 'Laadadres'}</dt>
            <dd className="font-medium text-vtk-ink">{trip.pickupAddress}</dd>
          </div>
        ) : null}
        {trip.destination ? (
          <div>
            <dt className="text-vtk-muted">{en ? 'Destination' : 'Bestemming'}</dt>
            <dd className="font-medium text-vtk-ink">{trip.destination}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-vtk-muted">{en ? 'Contact' : 'Contactpersoon'}</dt>
          <dd className="font-medium text-vtk-ink">
            {trip.user.name}
            {requesterGroup ? ` · ${requesterGroup}` : ''}
            <br />
            <a href={`mailto:${trip.user.email}`} className="font-normal text-vtk-navy underline underline-offset-4">
              {trip.user.email}
            </a>
            {trip.contactPhone ? (
              <>
                <br />
                <span className="font-normal">
                  <PhoneLink number={trip.contactPhone} />
                </span>
              </>
            ) : null}
          </dd>
        </div>
        {trip.eventName ? (
          <div>
            <dt className="text-vtk-muted">{en ? 'Event' : 'Evenement'}</dt>
            <dd className="font-medium text-vtk-ink">{trip.eventName}</dd>
          </div>
        ) : null}
        {trip.helpers.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-vtk-muted">{en ? 'Passengers' : 'Bijrijders'}</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-vtk-ink">
              {trip.helpers.map((helper) => (
                <span key={helper.id} className="inline-flex items-center gap-1.5">
                  {helper.name}
                  {helper.phone ? <PhoneLink number={helper.phone} /> : null}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {trip.helpersNote || trip.helpersPhone ? (
          <div className="sm:col-span-2">
            <dt className="text-vtk-muted">{en ? 'Helpers' : 'Bijrijders'}</dt>
            <dd className="font-medium text-vtk-ink">
              {trip.helpersNote}
              {trip.helpersPhone ? (
                <span className="font-normal">
                  {trip.helpersNote ? ' · ' : ''}
                  <PhoneLink number={trip.helpersPhone} />
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {trip.adminNote ? (
        <p className="mt-4 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
          <span className="font-medium text-vtk-ink">{en ? 'Note from Logistics:' : 'Nota van Logistiek:'}</span>{' '}
          {trip.adminNote}
        </p>
      ) : null}
      {trip.memberNote ? (
        <p className="mt-2 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
          <span className="font-medium text-vtk-ink">
            {en ? 'Note from the requester:' : 'Nota van de aanvrager:'}
          </span>{' '}
          {trip.memberNote}
        </p>
      ) : null}
    </li>
  );
}

/**
 * "Mijn ritten": wat een chauffeur van zijn eigen ritten ziet. Bewust enkel de
 * ritten die aan deze persoon toegewezen zijn, en zonder prijzen of
 * betaalstatus: dat is een zaak tussen de aanvrager en Logistiek. Wie geen
 * chauffeur is, komt hier op een lege pagina en niet op een foutmelding.
 */
export default async function RittenPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="trips" />;
  }
  const en = locale === 'en';

  const [trips, driver, feedTokens] = await Promise.all([
    tripsForDriver(session.user.id),
    isDriver(session.user.id),
    feedTokensForUser(session.user.id),
  ]);

  // Grens tussen komend en voorbij: het einde van de rit, niet de start. Een rit
  // die vandaag bezig is, hoort nog bovenaan te staan.
  const now = new Date();
  const upcoming = trips.filter((trip) => trip.endAt >= now);
  const past = trips.filter((trip) => trip.endAt < now).reverse();

  return (
    <PageShell
      title={
        <>
          {t.pageTripsTitle}{' '}
          {t.pageTripsAccent}
        </>
      }
      intro={t.pageTripsLead}
    >
      {/* V1: laten weten wanneer je kan rijden. Bovenaan en niet onderaan: het
          is de enige actie op dit scherm, de rest is lezen. */}
      {driver ? (
        <p className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface px-5 py-4 text-sm leading-7 text-vtk-body">
          <Link
            href="/ritten/beschikbaarheid"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            {en ? 'When can I drive?' : 'Wanneer kan ik rijden?'}
          </Link>{' '}
          {en
            ? 'Let Logistics know your free hours; they see them while planning.'
            : 'Laat weten wanneer je vrij bent; Logistiek ziet dat bij het plannen.'}
        </p>
      ) : null}

      {!driver && trips.length === 0 ? (
        <p className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface px-5 py-4 text-sm leading-7 text-vtk-body">
          {en ? 'You are not a driver for Logistics. Would you like to drive? Mail ' : 'Je bent geen chauffeur bij Logistiek. Wil je rijden? Mail '}
          <a href="mailto:logistiek@vtk.be" className="font-medium text-vtk-navy underline underline-offset-4">
            logistiek@vtk.be
          </a>
          .
        </p>
      ) : null}

      <div className="grid gap-8">
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Upcoming trips' : 'Komende ritten'} ({upcoming.length})
          </h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {driver
                ? en
                  ? 'Nothing yet. Logistics usually assigns a driver in the week before the trip.'
                  : 'Nog niets. Logistiek wijst een chauffeur meestal pas de week voor de rit toe.'
                : en
                  ? 'Nothing planned.'
                  : 'Niets gepland.'}
            </p>
          ) : (
            <ul className="mt-4 grid gap-4">
              {upcoming.map((trip) => (
                <TripCard key={trip.id} trip={trip} locale={locale} past={false} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
              {en ? 'Past trips' : 'Gereden ritten'} ({past.length})
            </h2>
            <ul className="mt-4 grid gap-4">
              {past.map((trip) => (
                <TripCard key={trip.id} trip={trip} locale={locale} past />
              ))}
            </ul>
          </section>
        ) : null}

        {/* Je ritten in je eigen agenda (A1). Enkel voor wie chauffeur is; de
            ledenkant heeft geen ToastProvider (die staat enkel rond /beheer),
            dus die komt hier rond dit ene blok. */}
        {driver ? (
          <ToastProvider>
            <FeedTokens
              canTeam={false}
              canDriver
              tokens={feedTokens
                .filter((token) => token.scope === 'DRIVER')
                .map((token) => ({
                  id: token.id,
                  label: token.label,
                  scope: token.scope,
                  createdAt: token.createdAt.toISOString(),
                  lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
                }))}
            />
          </ToastProvider>
        ) : null}
      </div>
    </PageShell>
  );
}
