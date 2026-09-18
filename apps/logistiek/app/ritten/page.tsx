import Link from 'next/link';
import { LogisticsIcon } from '@/components/logistics-icon';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { LinkedText } from '@/components/linked-text';
import { PhoneLink } from '@/components/phone-link';
import { copy, getLocale } from '@/lib/i18n';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/uitleen';
import {
  driverPhones,
  feedTokensForUser,
  groupMemberOptions,
  isDriver,
  isVanDriver,
  tripsForDriver,
  tripsForGroups,
  type DriverTrip,
} from '@/lib/uitleen-server';
import { GroupDriverPicker } from './group-driver-picker';
import { FeedTokens } from '@/components/feed-tokens';
import { ToastProvider } from '@/components/ui/toast';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * Een adres met een link naar de kaart erachter. Een chauffeur die vertrekt,
 * wil navigeren en niet overtypen; het adres zelf blijft staan zoals het
 * ingevuld is, want dat is wat je aan de telefoon voorleest.
 *
 * `geo:`-achtige diepe links bestaan wel maar werken per toestel anders; een
 * gewone maps-zoekopdracht opent op elk toestel de kaart-app die daar de
 * standaard is.
 */
function MapLink({ address, en }: { address: string; en: boolean }) {
  return (
    <>
      {address}{' '}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noreferrer noopener"
        className="whitespace-nowrap text-xs font-normal text-vtk-navy underline decoration-vtk-yellow underline-offset-2"
      >
        {en ? 'map' : 'kaart'}
      </a>
    </>
  );
}

function TripCard({
  trip,
  locale,
  past,
  driverPhone,
  groupMembers,
}: {
  trip: DriverTrip;
  locale: LogistiekLocale;
  past: boolean;
  /** Het nummer van wie rijdt; enkel op een rit van je post, niet op je eigen. */
  driverPhone?: string | null;
  /**
   * De leden van de post waaraan deze rit doorgegeven is. Aanwezig betekent:
   * jij mag hier de chauffeur kiezen.
   */
  groupMembers?: Array<{ id: string; name: string }>;
}) {
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
            <dd className="font-medium text-vtk-ink">
              <MapLink address={trip.pickupAddress} en={en} />
            </dd>
          </div>
        ) : null}
        {trip.destination ? (
          <div>
            <dt className="text-vtk-muted">{en ? 'Destination' : 'Bestemming'}</dt>
            <dd className="font-medium text-vtk-ink">
              <MapLink address={trip.destination} en={en} />
            </dd>
          </div>
        ) : null}
        {/* Wat er mee moet. Stond hier niet, terwijl het net het antwoord is op
            "waarom sta ik hier met de auto in plaats van met de kar". De link
            naar de materiaallijst die Logistiek erin plakt, is aanklikbaar. */}
        {trip.cargoNote ? (
          <div className="sm:col-span-2">
            <dt className="text-vtk-muted">{en ? 'Cargo' : 'Lading'}</dt>
            <dd className="font-medium text-vtk-ink">
              <LinkedText text={trip.cargoNote} />
            </dd>
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
        {/* Enkel op een rit van je post: op je eigen rit ben jij de chauffeur,
            en je eigen nummer opzoeken op een scherm is geen hulp. */}
        {trip.driver && driverPhone !== undefined ? (
          <div>
            <dt className="text-vtk-muted">{en ? 'Driver' : 'Chauffeur'}</dt>
            <dd className="font-medium text-vtk-ink">
              {trip.driver.name}
              {driverPhone ? (
                <>
                  {' · '}
                  <span className="font-normal">
                    <PhoneLink number={driverPhone} />
                  </span>
                </>
              ) : null}
            </dd>
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

      {/* De boodschap van Logistiek is geen voetnoot: daar staat de code van de
          poort in, of bij wie de sleutel ligt. Ze krijgt daarom de gele
          accentrand die op de site een uitgelicht paneel markeert, terwijl de
          nota van de aanvrager gewoon een nota blijft. */}
      {trip.adminNote ? (
        <p className="mt-4 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body shadow-[inset_3px_0_0_var(--yellow)]">
          <span className="font-medium text-vtk-ink">{en ? 'Note from Logistics:' : 'Nota van Logistiek:'}</span>{' '}
          <LinkedText text={trip.adminNote} />
        </p>
      ) : null}
      {trip.memberNote ? (
        <p className="mt-2 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
          <span className="font-medium text-vtk-ink">
            {en ? 'Note from the requester:' : 'Nota van de aanvrager:'}
          </span>{' '}
          <LinkedText text={trip.memberNote} />
        </p>
      ) : null}

      {/* Doorgegeven aan jouw post: dan duid je hier zelf iemand aan. Onderaan
          de kaart en niet bovenaan: eerst weten wat de rit is, dan pas kiezen
          wie hem doet. */}
      {groupMembers && !past && trip.assignedGroup ? (
        <GroupDriverPicker
          bookingId={trip.id}
          driverId={trip.driverId}
          members={groupMembers}
          groupName={en ? trip.assignedGroup.nameEn : trip.assignedGroup.nameNl}
        />
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
    return <LoginGate variant="trips" returnTo="/ritten" />;
  }
  const en = locale === 'en';

  const myGroupIds = session.groups.map((group) => group.id);

  const [trips, groupTrips, driver, vanDriver, feedTokens] = await Promise.all([
    tripsForDriver(session.user.id),
    // Wat je medepostleden rijden, en wat er nog een chauffeur mist omdat
    // Logistiek de rit aan jouw post doorgaf.
    tripsForGroups(session.user.id, myGroupIds),
    isDriver(session.user.id),
    isVanDriver(session.user.id),
    feedTokensForUser(session.user.id),
  ]);

  // Enkel voor de ritten van je post: het nummer van wie rijdt, en de leden van
  // de post die de rit mag invullen. Twee queries op precies wat op het scherm
  // komt, en niets wanneer er geen postritten zijn.
  const assignedGroupIds = [
    ...new Set(
      groupTrips
        .map((trip) => trip.assignedGroup?.id)
        .filter((id): id is string => Boolean(id) && myGroupIds.includes(id as string))
    ),
  ];
  const [groupDriverPhones, membersPerGroup] = await Promise.all([
    driverPhones(groupTrips.map((trip) => trip.driverId).filter((id): id is string => Boolean(id))),
    Promise.all(
      assignedGroupIds.map(async (groupId) => [groupId, await groupMemberOptions(groupId)] as const)
    ).then((entries) => new Map(entries)),
  ]);

  // Grens tussen komend en voorbij: het einde van de rit, niet de start. Een rit
  // die vandaag bezig is, hoort nog bovenaan te staan.
  const now = new Date();
  const upcoming = trips.filter((trip) => trip.endAt >= now);
  const past = trips.filter((trip) => trip.endAt < now).reverse();
  // Van je post tonen we enkel wat er nog aankomt: wie er vorige maand reed, is
  // historiek van Logistiek en niet iets waar een post iets mee doet.
  const groupUpcoming = groupTrips.filter((trip) => trip.endAt >= now);
  const groupNames = [
    ...new Set(
      groupUpcoming.map((trip) =>
        trip.assignedGroup
          ? en
            ? trip.assignedGroup.nameEn
            : trip.assignedGroup.nameNl
          : trip.group
            ? en
              ? trip.group.nameEn
              : trip.group.nameNl
            : ''
      )
    ),
  ].filter(Boolean);

  return (
    <PageShell
      title={
        <>
          {t.pageTripsTitle}{' '}
          {t.pageTripsAccent}
        </>
      }
      intro={t.pageTripsLead}
      /* V1: laten weten wanneer je kan rijden. In de kop en niet als paneel
         tussen de ritten: het is de enige actie op dit scherm en de rest is
         lezen, en als paneel las het als een mededeling die je wegscrolt. */
      action={
        vanDriver ? (
          <Link href="/ritten/beschikbaarheid" className="logistics-head-button">
            <LogisticsIcon name="reservation" className="h-4 w-4" />
            {en ? 'My availability' : 'Beschikbaarheid'}
          </Link>
        ) : null
      }
    >
      {!driver && trips.length === 0 && groupTrips.length === 0 ? (
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

        {/* De ritten van je post. Een tweede sectie en geen tweede tabblad: het
            zijn er meestal een handvol, en een tabblad verstopt precies de rit
            die nog een chauffeur zoekt. Valt helemaal weg wanneer er niets is;
            een lege sectie met een uitleg erbij zou op elk scherm staan van
            iedereen die bij een post zit. */}
        {groupUpcoming.length > 0 ? (
          <ToastProvider>
            <section>
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
                {en ? 'Trips of my post' : 'Ritten van mijn post'}
                {groupNames.length > 0 ? ` (${groupNames.join(', ')})` : ''}
              </h2>
              <p className="mt-1 text-sm text-vtk-muted">
                {en
                  ? 'What your fellow members are driving, and the trips Logistics handed to your post to fill in yourselves.'
                  : 'Wat je medeleden rijden, en de ritten die Logistiek aan je post doorgaf om zelf in te vullen.'}
              </p>
              <ul className="mt-4 grid gap-4">
                {groupUpcoming.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    locale={locale}
                    past={false}
                    driverPhone={
                      trip.driverId ? (groupDriverPhones.get(trip.driverId)?.number ?? null) : null
                    }
                    groupMembers={
                      trip.assignedGroup && myGroupIds.includes(trip.assignedGroup.id)
                        ? (membersPerGroup.get(trip.assignedGroup.id) ?? [])
                        : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          </ToastProvider>
        ) : null}

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
