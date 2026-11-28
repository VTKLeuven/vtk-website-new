import Link from '@vtk/ui/link';
import { LogisticsIcon } from '@/components/logistics-icon';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { FeedTokens } from '@/components/feed-tokens';
import { driverColorVar } from '@/lib/driver-colors';
import { copy, getLocale } from '@/lib/i18n';
import type { LogistiekLocale } from '@/lib/i18n-shared';
import { canManage, getSession } from '@/lib/session';
import {
  formatBrusselsTime,
  isoWeekNumber,
  onTripForNotes,
  startOfWeek,
  toBrusselsDateValue,
} from '@/lib/uitleen';
import {
  driverColorOverrides,
  driverPhones,
  feedTokensForUser,
  groupMemberOptions,
  isDriver,
  isVanDriver,
  postMembersWithPhones,
  tripNotesFor,
  tripsForDriver,
  tripsForGroups,
  type DriverTrip,
} from '@/lib/uitleen-server';
import { vehicleIconName } from '@/lib/vehicle-icon';
import type { TripMonth, TripView, TripWeek } from './trip-view';
import { TripsAgenda } from './trips-agenda';
import { withoutRequester } from '@/lib/trip-post-members';
import { localizedTitle } from '@/lib/page-title';

export const generateMetadata = localizedTitle({ nl: copy.nl.navTrips, en: copy.en.navTrips });

const DAY_MS = 24 * 60 * 60 * 1000;

/** Zonder de punt die `nl-BE` achter een afgekorte dag of maand zet. */
function short(text: string): string {
  return text.replace(/\./g, '');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * De woorden rond een datum, in Belgische tijd. Eén plek, zodat de tegel, de
 * week en de maand dezelfde afkortingen gebruiken.
 */
function dateWords(locale: LogistiekLocale) {
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const brussels = { timeZone: 'Europe/Brussels' } as const;
  const weekday = new Intl.DateTimeFormat(tag, { ...brussels, weekday: 'short' });
  const day = new Intl.DateTimeFormat(tag, { ...brussels, day: 'numeric' });
  const long = new Intl.DateTimeFormat(tag, { ...brussels, weekday: 'long', day: 'numeric', month: 'long' });
  const month = new Intl.DateTimeFormat(tag, { ...brussels, month: 'long', year: 'numeric' });
  // Een week is een date-only op UTC-middernacht (`startOfWeek`): die lees je in UTC.
  const rangeDay = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric' });
  const rangeDayMonth = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'short' });

  return {
    weekday: (date: Date) => short(weekday.format(date)),
    day: (date: Date) => day.format(date),
    long: (date: Date) => long.format(date),
    month: (date: Date) => capitalize(month.format(date)),
    /** "16–22 nov", of "30 nov – 6 dec" over een maandgrens. */
    weekRange(monday: Date) {
      const sunday = new Date(monday.getTime() + 6 * DAY_MS);
      return monday.getUTCMonth() === sunday.getUTCMonth()
        ? `${rangeDay.format(monday)}–${short(rangeDayMonth.format(sunday))}`
        : `${short(rangeDayMonth.format(monday))} – ${short(rangeDayMonth.format(sunday))}`;
    },
  };
}

/** Het eerste stuk van een adres, voor in de rij: "Brouwerij Haacht". */
function firstPart(address: string | null): string {
  return address ? address.split(',')[0].trim() : '';
}

/**
 * "Mijn ritten": de ritten die jij rijdt en die van je post, als één agenda per
 * week. Bewust zonder prijzen of betaalstatus: dat is een zaak tussen de
 * aanvrager en Logistiek. Wie geen chauffeur is en geen rit op zijn post heeft,
 * komt hier op een lege pagina en niet op een foutmelding.
 *
 * Elke rit is één regel die openklapt; zie `trips-agenda.tsx` en
 * docs/design-decisions.md ("Mijn ritten als agenda").
 */
export default async function RittenPage({ searchParams }: { searchParams: Promise<{ rit?: string }> }) {
  const [session, locale, params] = await Promise.all([getSession(), getLocale(), searchParams]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="trips" returnTo="/ritten" />;
  }
  const en = locale === 'en';
  const userId = session.user.id;
  const myGroupIds = session.groups.map((group) => group.id);

  const [trips, groupTrips, driver, vanDriver, feedTokens] = await Promise.all([
    tripsForDriver(userId),
    // Wat je post aanvroeg, wat je medepostleden rijden, en wat er nog een
    // chauffeur mist omdat Logistiek de rit aan jouw post doorgaf.
    tripsForGroups(myGroupIds),
    isDriver(userId),
    isVanDriver(userId),
    feedTokensForUser(userId),
  ]);

  // Grens tussen komend en voorbij: het einde van de rit, niet de start. Een rit
  // die vandaag bezig is, hoort nog bovenaan te staan.
  const now = new Date();
  const postIds = new Set(groupTrips.map((trip) => trip.id));
  // Je eigen ritten en die van je post in één lijst: een rit die je zelf rijdt
  // voor je post staat er nu één keer, met beide merktekens.
  const byId = new Map<string, DriverTrip>();
  for (const trip of [...trips, ...groupTrips]) byId.set(trip.id, trip);
  const upcoming = [...byId.values()]
    .filter((trip) => trip.endAt >= now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  // Van je post tonen we enkel wat er nog aankomt: wie er vorige maand reed, is
  // historiek van Logistiek en niet iets waar een post iets mee doet.
  const past = trips.filter((trip) => trip.endAt < now).sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const shown = [...upcoming, ...past];

  const assignedGroupIds = [
    ...new Set(
      upcoming
        .map((trip) => trip.assignedGroup?.id)
        .filter((id): id is string => Boolean(id) && myGroupIds.includes(id as string))
    ),
  ];
  const otherDriverIds = [
    ...new Set(
      shown.map((trip) => trip.driverId).filter((id): id is string => Boolean(id) && id !== userId)
    ),
  ];
  const viewer = { userId, groupIds: myGroupIds };
  // Wie de chauffeur kan bellen over een rit zonder bijrijder: de leden van de
  // post die hem vroeg. Enkel bij wat je zelf nog rijdt; de nummers van een rit
  // blijven bij haar post en bij wie ze rijdt, en een post kent haar eigen leden.
  const withoutHelpers = (trip: DriverTrip) =>
    trip.driverId === userId && trip.helpers.length === 0 && !trip.helpersNote && !trip.helpersPhone;
  const [phones, membersPerGroup, notesPerTrip, colors, postMembers] = await Promise.all([
    driverPhones(otherDriverIds),
    Promise.all(
      assignedGroupIds.map(async (groupId) => [groupId, await groupMemberOptions(groupId)] as const)
    ).then((entries) => new Map(entries)),
    // De eigen nota's bij alles op dit scherm (F4.20), in één query.
    tripNotesFor(
      shown.map((trip) => trip.id),
      {
        userId,
        onTripIds: shown.filter((trip) => onTripForNotes(trip, viewer)).map((trip) => trip.id),
        logistiek: canManage(session),
      }
    ),
    // Dezelfde kleur als in de planning, zodat een chauffeur er overal hetzelfde
    // uitziet. Enkel nodig wanneer iemand anders dan jij rijdt.
    otherDriverIds.length > 0 ? driverColorOverrides() : Promise.resolve({}),
    postMembersWithPhones(upcoming.filter(withoutHelpers).map((trip) => trip.groupId)),
  ]);

  const words = dateWords(locale);
  const today = toBrusselsDateValue(now);
  const thisMonday = startOfWeek(now);

  function view(trip: DriverTrip, isPast: boolean): TripView {
    const requesterGroup = trip.group ? (en ? trip.group.nameEn : trip.group.nameNl) : null;
    const requester = requesterGroup ?? trip.requesterName ?? null;
    const sameDay = toBrusselsDateValue(trip.startAt) === toBrusselsDateValue(trip.endAt);
    const assignedToMe =
      !isPast && trip.assignedGroup && myGroupIds.includes(trip.assignedGroup.id) ? trip.assignedGroup : null;
    const driverView: TripView['driver'] =
      trip.driverId === userId
        ? { kind: 'me' }
        : trip.driver
          ? {
              kind: 'other',
              name: trip.driver.name,
              phone: phones.get(trip.driver.id)?.number ?? null,
              color: driverColorVar(trip.driver.id, colors),
            }
          : trip.vehicle.needsDriver
            ? { kind: 'none' }
            : { kind: 'notNeeded' };
    const post = postIds.has(trip.id);
    const dayLong = words.long(trip.startAt);

    return {
      id: trip.id,
      weekKey: '',
      dayShort: words.weekday(trip.startAt),
      dayNumber: words.day(trip.startAt),
      dayLong,
      today: !isPast && (toBrusselsDateValue(trip.startAt) === today || trip.startAt <= now),
      hours: `${formatBrusselsTime(trip.startAt, locale)}–${formatBrusselsTime(trip.endAt, locale)}`,
      hoursUntil: sameDay
        ? null
        : `${en ? 'until' : 'tot'} ${words.weekday(trip.endAt)} ${words.day(trip.endAt)}`,
      vehicleName: en ? trip.vehicle.nameEn : trip.vehicle.nameNl,
      vehicleIcon: vehicleIconName(trip.vehicle),
      purpose: trip.purpose,
      requester,
      eventName: trip.eventName,
      pickup: trip.pickupAddress,
      destination: trip.destination,
      cargoNote: trip.cargoNote,
      adminNote: trip.adminNote,
      memberNote: trip.memberNote,
      contact: {
        name: trip.user.name,
        role: `${en ? 'Contact' : 'Contactpersoon'}${requester ? `, ${requester}` : ''}`,
        email: trip.user.email,
        phone: trip.contactPhone,
      },
      driver: driverView,
      helpers: trip.helpers,
      helpersLegacy: [trip.helpersNote, trip.helpersPhone].filter(Boolean).join(' · ') || null,
      postMembers:
        !isPast && withoutHelpers(trip) && trip.groupId && requesterGroup
          ? withoutRequester(requesterGroup, postMembers.get(trip.groupId), trip.userId)
          : null,
      // Dezelfde regel als `canEditHelpers` op de server: je eigen post, of een
      // rit die aan je post doorgegeven is. Een gereden rit niet meer.
      canEditHelpers: post && !isPast && trip.status === 'APPROVED',
      notes: notesPerTrip.get(trip.id) ?? [],
      mine: trip.driverId === userId,
      post,
      picker: assignedToMe
        ? {
            groupName: en ? assignedToMe.nameEn : assignedToMe.nameNl,
            driverId: trip.driverId,
            members: membersPerGroup.get(assignedToMe.id) ?? [],
          }
        : null,
      completed: trip.status === 'COMPLETED',
      searchText: [
        trip.purpose,
        requester,
        trip.eventName,
        trip.pickupAddress,
        trip.destination,
        trip.user.name,
        trip.driver?.name,
        trip.cargoNote,
        en ? trip.vehicle.nameEn : trip.vehicle.nameNl,
        dayLong,
        ...trip.helpers.map((helper) => helper.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  }

  // Per week, zoals op /shift: "Deze week", "Volgende week", dan het nummer. Een
  // rit die vorige week begon en nog loopt, hoort bij deze week.
  const weeks: TripWeek[] = [];
  for (const trip of upcoming) {
    const start = startOfWeek(trip.startAt);
    const monday = start < thisMonday ? thisMonday : start;
    const key = monday.toISOString().slice(0, 10);
    let week = weeks.find((entry) => entry.key === key);
    if (!week) {
      const offset = Math.round((monday.getTime() - thisMonday.getTime()) / (7 * DAY_MS));
      week = {
        key,
        label:
          offset === 0
            ? en
              ? 'This week'
              : 'Deze week'
            : offset === 1
              ? en
                ? 'Next week'
                : 'Volgende week'
              : `Week ${isoWeekNumber(monday)}`,
        range: words.weekRange(monday),
        trips: [],
      };
      weeks.push(week);
    }
    week.trips.push({ ...view(trip, false), weekKey: key });
  }

  const months: TripMonth[] = [];
  for (const trip of past) {
    const key = toBrusselsDateValue(trip.startAt).slice(0, 7);
    let month = months.find((entry) => entry.key === key);
    if (!month) {
      month = { key, label: words.month(trip.startAt), trips: [] };
      months.push(month);
    }
    month.trips.push(view(trip, true));
  }

  const groupNames = [
    ...new Set(
      upcoming
        .filter((trip) => postIds.has(trip.id))
        .map((trip) => {
          const group = trip.assignedGroup && myGroupIds.includes(trip.assignedGroup.id) ? trip.assignedGroup : trip.group;
          return group ? (en ? group.nameEn : group.nameNl) : '';
        })
        .filter(Boolean)
    ),
  ];

  return (
    <PageShell
      title={
        <>
          {t.pageTripsTitle} {t.pageTripsAccent}
        </>
      }
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
        {driver || upcoming.length > 0 || past.length > 0 ? (
          <TripsAgenda
            weeks={weeks}
            months={months}
            locale={locale}
            postLabel={groupNames.length === 1 ? groupNames[0] : en ? 'My post' : 'Mijn post'}
            emptyText={
              driver
                ? en
                  ? 'Nothing yet. Logistics usually assigns a driver in the week before the trip.'
                  : 'Nog niets. Logistiek wijst een chauffeur meestal pas de week voor de rit toe.'
                : en
                  ? 'Nothing planned.'
                  : 'Niets gepland.'
            }
            initialOpen={params.rit && byId.has(params.rit) ? params.rit : null}
          />
        ) : null}

        {/* Je ritten in je eigen agenda (A1). Enkel voor wie chauffeur is. */}
        {driver ? (
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
                expired: token.expired,
              }))}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
