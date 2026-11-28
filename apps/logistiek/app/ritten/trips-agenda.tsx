'use client';

import { useEffect, useState } from 'react';
import { LinkedText } from '@/components/linked-text';
import { LogisticsIcon } from '@/components/logistics-icon';
import { TripHelpers } from '@/components/trip-helpers';
import { TripNotes } from '@/components/trip-notes';
import { driverColorVar } from '@/lib/driver-colors';
import type { LogistiekLocale } from '@/lib/i18n-shared';
import { GroupDriverPicker } from './group-driver-picker';
import { Avatar } from '@/components/person-avatar';
import type { TripMonth, TripView, TripWeek } from './trip-view';
import './ritten.css';

/**
 * "Mijn ritten" als agenda (zie docs/design-decisions.md, "Mijn ritten als
 * agenda").
 *
 * **Elke rit is één regel die openklapt.** Een kaart per rit met alles open was
 * op een telefoon een halve meter per rit, en met een drukke week vond je de rit
 * van morgen niet meer terug. De regel zegt wanneer, wat, van waar naar waar en
 * wie rijdt; de rest staat één tik verder.
 *
 * **Minder woorden, niet minder informatie.** Het uur, het voertuig, de route en
 * de chauffeur dragen een icoon, een bolletje of een kleur in plaats van een
 * label ervoor; wat in de regel niet past (adressen voluit, nummers, nota's)
 * staat in het opengeklapte deel. Een nummer staat achter een belknop: wie het
 * nodig heeft, wil bellen en niet overtypen.
 */

type Filter = 'all' | 'mine' | 'post';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollToTrip(id: string) {
  requestAnimationFrame(() => {
    document
      .getElementById(`rit-${id}`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

/**
 * De route in Google Maps. Met beide adressen de route, met één ervan enkel die
 * plek; zonder adres is er geen knop.
 */
function mapsUrl(pickup: string | null, destination: string | null): string | null {
  if (pickup && destination) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(destination)}`;
  }
  const only = destination ?? pickup;
  return only ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(only)}` : null;
}

function dial(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}

function splitAddress(address: string): { name: string; rest: string } {
  const [name, ...rest] = address.split(',');
  return { name: name.trim(), rest: rest.join(',').trim() };
}

export function TripsAgenda({
  weeks,
  months,
  locale,
  postLabel,
  emptyText,
  initialOpen,
}: {
  weeks: TripWeek[];
  months: TripMonth[];
  locale: LogistiekLocale;
  /** De naam van je post op het filter, of "Mijn post" bij meerdere. */
  postLabel: string;
  emptyText: string;
  /** `?rit=<id>`: een link uit een mail opent meteen die rit. */
  initialOpen: string | null;
}) {
  const en = locale === 'en';
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(initialOpen);
  const pastHasInitial = initialOpen ? months.some((month) => month.trips.some((trip) => trip.id === initialOpen)) : false;
  const [pastOpen, setPastOpen] = useState(pastHasInitial);

  useEffect(() => {
    if (initialOpen) scrollToTrip(initialOpen);
  }, [initialOpen]);

  const upcoming = weeks.flatMap((week) => week.trips);
  const pastCount = months.reduce((sum, month) => sum + month.trips.length, 0);
  const counts = {
    all: upcoming.length,
    mine: upcoming.filter((trip) => trip.mine).length,
    post: upcoming.filter((trip) => trip.post).length,
  };
  const needle = query.trim().toLowerCase();
  const matches = (trip: TripView) =>
    (filter === 'mine' ? trip.mine : filter === 'post' ? trip.post : true) &&
    (!needle || trip.searchText.includes(needle));
  const shownWeeks = weeks
    .map((week) => ({ ...week, trips: week.trips.filter(matches) }))
    .filter((week) => week.trips.length > 0);
  // Gereden ritten zijn altijd de jouwe; het filter "van mijn post" laat ze dus
  // weg, de zoekopdracht niet.
  const shownMonths = months
    .map((month) => ({ ...month, trips: filter === 'post' ? [] : month.trips.filter(matches) }))
    .filter((month) => month.trips.length > 0);
  const shownPast = shownMonths.reduce((sum, month) => sum + month.trips.length, 0);

  // Een rit die aan je post doorgegeven is en nog niemand heeft: dat is de enige
  // taak op dit scherm, dus ze staat bovenaan en niet in de lijst verstopt.
  const waiting = upcoming.filter((trip) => trip.picker && trip.driver.kind === 'none');

  function toggle(id: string) {
    setOpen((current) => (current === id ? null : id));
  }

  function openWaiting() {
    const first = waiting[0];
    if (!first) return;
    if (filter === 'mine') setFilter('all');
    setQuery('');
    setOpen(first.id);
    scrollToTrip(first.id);
  }

  const showFilters = counts.post > 0 && counts.mine !== counts.all;
  const showSearch = upcoming.length + pastCount >= 5;

  return (
    <div className="trips">
      {waiting.length > 0 ? (
        <div className="trips-alert">
          <span className="trips-alert-icon" aria-hidden>
            <LogisticsIcon name="driver" className="h-6 w-6" />
          </span>
          <p className="trips-alert-text">
            <strong>
              {waiting.length === 1
                ? en
                  ? `${waiting[0].picker?.groupName} needs a driver`
                  : `${waiting[0].picker?.groupName} zoekt een chauffeur`
                : en
                  ? `${waiting.length} trips need a driver`
                  : `${waiting.length} ritten zoeken een chauffeur`}
            </strong>
            <span>
              {waiting[0].purpose}, {waiting[0].dayShort} {waiting[0].dayNumber}, {waiting[0].hours}
            </span>
          </p>
          <button type="button" className="trips-button" onClick={openWaiting}>
            {en ? 'Choose a driver' : 'Chauffeur kiezen'}
          </button>
        </div>
      ) : null}

      {showFilters || showSearch ? (
        <div className="trips-bar">
          {showFilters ? (
            <div className="trips-seg" role="group" aria-label={en ? 'Which trips' : 'Welke ritten'}>
              {(
                [
                  ['all', en ? 'All' : 'Alles'],
                  ['mine', en ? 'I drive' : 'Ik rij'],
                  ['post', postLabel],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="trips-seg-button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span className="trips-seg-count">{counts[key]}</span>
                </button>
              ))}
            </div>
          ) : null}
          {showSearch ? (
            <label className="trips-search">
              <LogisticsIcon name="search" className="h-4 w-4 shrink-0" />
              <span className="sr-only">{en ? 'Search your trips' : 'Zoek in je ritten'}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={en ? 'Search a trip, address or name' : 'Zoek een rit, adres of naam'}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {upcoming.length === 0 ? (
        <p className="trips-empty">{emptyText}</p>
      ) : shownWeeks.length === 0 ? (
        <div className="trips-empty trips-empty-row">
          <p>
            {needle
              ? en
                ? `No upcoming trips for "${query.trim()}".`
                : `Geen komende ritten voor "${query.trim()}".`
              : en
                ? 'No upcoming trips in this selection.'
                : 'Geen komende ritten in deze selectie.'}
          </p>
          <button
            type="button"
            className="trips-button trips-button-light"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            {en ? 'Show all' : 'Alles tonen'}
          </button>
        </div>
      ) : (
        <div className="trips-weeks">
          {shownWeeks.map((week) => (
            <section key={week.key} className="trips-week" aria-labelledby={`week-${week.key}`}>
              <h2 id={`week-${week.key}`} className="trips-week-title">
                {week.label}
                <span>{week.range}</span>
              </h2>
              <ul className="trips-panel">
                {week.trips.map((trip) => (
                  <TripItem
                    key={trip.id}
                    trip={trip}
                    en={en}
                    locale={locale}
                    open={open === trip.id}
                    onToggle={() => toggle(trip.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Gereden ritten staan dicht: ze zijn er om iets terug te vinden, niet om
          door te lezen. Een zoekopdracht opent ze, want dan zoek je net dat. */}
      {pastCount > 0 && shownPast > 0 ? (
        <section className="trips-past">
          <button
            type="button"
            className="trips-past-toggle"
            aria-expanded={pastOpen || Boolean(needle)}
            onClick={() => setPastOpen((value) => !value)}
          >
            {en ? 'Past trips' : 'Gereden ritten'}
            <span className="trips-seg-count">{shownPast}</span>
            <span className="trips-chevron" aria-hidden>
              <LogisticsIcon name="chevron" className="h-5 w-5" />
            </span>
          </button>
          {pastOpen || needle
            ? shownMonths.map((month) => (
                <div key={month.key} className="trips-week">
                  <h3 className="trips-month-title">{month.label}</h3>
                  <ul className="trips-panel">
                    {month.trips.map((trip) => (
                      <TripItem
                        key={trip.id}
                        trip={trip}
                        en={en}
                        locale={locale}
                        open={open === trip.id}
                        onToggle={() => toggle(trip.id)}
                        past
                      />
                    ))}
                  </ul>
                </div>
              ))
            : null}
        </section>
      ) : null}
    </div>
  );
}

function TripItem({
  trip,
  en,
  locale,
  open,
  onToggle,
  past = false,
}: {
  trip: TripView;
  en: boolean;
  locale: LogistiekLocale;
  open: boolean;
  onToggle: () => void;
  past?: boolean;
}) {
  const noteCount = trip.notes.length + (trip.memberNote ? 1 : 0);
  const pickup = trip.pickup ? splitAddress(trip.pickup) : null;
  const destination = trip.destination ? splitAddress(trip.destination) : null;
  const detailId = `rit-detail-${trip.id}`;

  return (
    <li id={`rit-${trip.id}`} className="trips-item" data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className="trips-row"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="trips-date" data-today={trip.today ? 'true' : undefined} data-past={past ? 'true' : undefined}>
          <span className="trips-date-day" aria-hidden>
            {trip.dayShort}
          </span>
          <span className="trips-date-number" aria-hidden>
            {trip.dayNumber}
          </span>
          <span className="sr-only">{trip.dayLong}</span>
        </span>

        <span className="trips-main">
          <span className="trips-title-line">
            <span className="trips-title">{trip.purpose}</span>
            {trip.requester ? (
              <span className="trips-tag">
                <span className="sr-only">{en ? 'for ' : 'voor '}</span>
                {trip.requester}
              </span>
            ) : null}
          </span>
          <span className="trips-meta">
            <span className="trips-time">
              <LogisticsIcon name="clock" className="h-3.5 w-3.5" />
              {trip.hours}
              {trip.hoursUntil ? <span className="trips-time-until">{trip.hoursUntil}</span> : null}
            </span>
            <span className="trips-vehicle">
              <LogisticsIcon name={trip.vehicleIcon} className="h-4 w-4" />
              {trip.vehicleName}
            </span>
          </span>
        </span>

        <span className="trips-route">
          {pickup ? (
            <span className="trips-route-line">
              <span className="trips-dot" aria-hidden />
              <span>
                <span className="sr-only">{en ? 'From ' : 'Van '}</span>
                {pickup.name}
              </span>
            </span>
          ) : null}
          {destination ? (
            <span className="trips-route-line">
              <span className="trips-dot trips-dot-end" aria-hidden />
              <span>
                <span className="sr-only">{en ? 'To ' : 'Naar '}</span>
                {destination.name}
              </span>
            </span>
          ) : null}
        </span>

        <span className="trips-side">
          {past ? (
            trip.completed ? (
              <span className="trips-done">
                <LogisticsIcon name="check" className="h-3.5 w-3.5" />
                {en ? 'Completed' : 'Afgerond'}
              </span>
            ) : null
          ) : (
            <DriverBadge driver={trip.driver} en={en} />
          )}
          <span className="trips-flags">
            {trip.adminNote ? (
              <span className="trips-flag trips-flag-logistics" title={en ? 'Note from Logistics' : 'Nota van Logistiek'}>
                <LogisticsIcon name="alert" className="h-3.5 w-3.5" strokeWidth={2.6} />
                <span className="sr-only">{en ? 'Note from Logistics' : 'Nota van Logistiek'}</span>
              </span>
            ) : null}
            {trip.helpers.length > 0 ? (
              <span className="trips-flag" title={en ? 'Passengers' : 'Bijrijders'}>
                <LogisticsIcon name="people" className="h-3.5 w-3.5" strokeWidth={2} />
                {trip.helpers.length}
                <span className="sr-only">{en ? ' passengers' : ' bijrijders'}</span>
              </span>
            ) : null}
            {noteCount > 0 ? (
              <span className="trips-flag" title={en ? 'Notes' : "Nota's"}>
                <LogisticsIcon name="note" className="h-3.5 w-3.5" strokeWidth={2} />
                {noteCount}
                <span className="sr-only">{en ? ' notes' : " nota's"}</span>
              </span>
            ) : null}
          </span>
        </span>

        <span className="trips-chevron" aria-hidden>
          <LogisticsIcon name="chevron" className="h-5 w-5" />
        </span>
      </button>

      {open ? (
        <div id={detailId} className="trips-detail">
          {trip.picker ? (
            <GroupDriverPicker
              bookingId={trip.id}
              driverId={trip.picker.driverId}
              members={trip.picker.members}
              groupName={trip.picker.groupName}
              locale={locale}
            />
          ) : null}

          <div className="trips-detail-grid">
            <section className="trips-block">
              <h3 className="trips-block-title">Route</h3>
              {pickup || destination ? (
                <ol className="trips-timeline">
                  {pickup ? (
                    <li>
                      <span className="trips-dot" aria-hidden />
                      <span>
                        <span className="sr-only">{en ? 'Loading address: ' : 'Laadadres: '}</span>
                        <span className="trips-place">{pickup.name}</span>
                        {pickup.rest ? <span className="trips-address">{pickup.rest}</span> : null}
                      </span>
                    </li>
                  ) : null}
                  {destination ? (
                    <li>
                      <span className="trips-dot trips-dot-end" aria-hidden />
                      <span>
                        <span className="sr-only">{en ? 'Destination: ' : 'Bestemming: '}</span>
                        <span className="trips-place">{destination.name}</span>
                        {destination.rest ? <span className="trips-address">{destination.rest}</span> : null}
                      </span>
                    </li>
                  ) : null}
                </ol>
              ) : (
                <p className="trips-quiet">{en ? 'No address given.' : 'Geen adres opgegeven.'}</p>
              )}
              <MapsButton url={mapsUrl(trip.pickup, trip.destination)} en={en} />
              {trip.cargoNote || trip.eventName ? (
                <div className="trips-facts">
                  {trip.cargoNote ? (
                    <p className="trips-fact">
                      <span className="trips-fact-icon" title={en ? 'Cargo' : 'Lading'} aria-hidden>
                        <LogisticsIcon name="material" className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <span>
                        <span className="sr-only">{en ? 'Cargo: ' : 'Lading: '}</span>
                        <LinkedText text={trip.cargoNote} locale={locale} />
                      </span>
                    </p>
                  ) : null}
                  {trip.eventName ? (
                    <p className="trips-fact">
                      <span className="trips-fact-icon" title={en ? 'Event' : 'Evenement'} aria-hidden>
                        <LogisticsIcon name="event" className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <span>
                        <span className="sr-only">{en ? 'Event: ' : 'Evenement: '}</span>
                        {trip.eventName}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="trips-block">
              <h3 className="trips-block-title">{en ? 'People' : 'Mensen'}</h3>
              <ul className="trips-people">
                <Person
                  name={trip.contact.name}
                  role={trip.contact.role}
                  phone={trip.contact.phone}
                  email={trip.contact.email}
                  en={en}
                />
                {trip.driver.kind === 'other' ? (
                  <Person
                    name={trip.driver.name}
                    role={en ? 'Driver' : 'Chauffeur'}
                    phone={trip.driver.phone}
                    color={trip.driver.color}
                    en={en}
                  />
                ) : null}
              </ul>
              <TripHelpers
                bookingId={trip.id}
                helpers={trip.helpers}
                legacyNote={trip.helpersLegacy}
                canEdit={trip.canEditHelpers}
                locale={locale}
                variant="people"
                postMembers={trip.postMembers}
              />
            </section>

            <section className="trips-block">
              <h3 className="trips-block-title">{en ? 'Notes' : "Nota's"}</h3>
              {/* De boodschap van Logistiek is geen voetnoot: daar staat de code
                  van de poort in, of bij wie de sleutel ligt. Ze krijgt daarom
                  het gele vlak, terwijl een nota van de aanvrager een gewone
                  ballon blijft. */}
              {trip.adminNote ? (
                <div className="trips-logistics-note">
                  <span className="trips-logistics-note-title">
                    <LogisticsIcon name="alert" className="h-3.5 w-3.5" strokeWidth={2.8} />
                    {en ? 'Logistics' : 'Logistiek'}
                  </span>
                  <span>
                    <LinkedText text={trip.adminNote} locale={locale} />
                  </span>
                </div>
              ) : null}
              {trip.memberNote ? (
                <div className="trips-bubble">
                  <Avatar name={trip.contact.name} size="small" />
                  <div className="trips-bubble-text">
                    <span className="trips-bubble-meta">
                      {trip.contact.name}, {en ? 'requester' : 'aanvrager'}
                    </span>
                    <LinkedText text={trip.memberNote} locale={locale} />
                  </div>
                </div>
              ) : null}
              {!trip.adminNote && !trip.memberNote && trip.notes.length === 0 ? (
                <p className="trips-quiet">{en ? 'No notes yet.' : "Nog geen nota's."}</p>
              ) : null}
              <TripNotes bookingId={trip.id} notes={trip.notes} canWrite locale={locale} variant="thread" />
            </section>
          </div>

          {/* Op een telefoon is een opengeklapte rit langer dan het scherm; dan
              moet je niet terug naar boven om hem dicht te klappen. */}
          <button type="button" className="trips-collapse" onClick={onToggle} aria-controls={detailId}>
            {en ? 'Collapse' : 'Inklappen'}
            <LogisticsIcon name="chevron" className="h-4 w-4 rotate-180" />
          </button>
        </div>
      ) : null}
    </li>
  );
}

function DriverBadge({ driver, en }: { driver: TripView['driver']; en: boolean }) {
  const name =
    driver.kind === 'me'
      ? en
        ? 'You drive'
        : 'Jij rijdt'
      : driver.kind === 'other'
        ? driver.name
        : driver.kind === 'none'
          ? en
            ? 'Nobody yet'
            : 'Nog niemand'
          : en
            ? 'No driver needed'
            : 'Geen chauffeur nodig';
  return (
    <span className="trips-who">
      {driver.kind === 'me' ? (
        <Avatar me en={en} />
      ) : driver.kind === 'other' ? (
        <Avatar name={driver.name} color={driver.color} />
      ) : (
        <span className="trips-avatar trips-avatar-empty" aria-hidden>
          {driver.kind === 'none' ? '?' : '–'}
        </span>
      )}
      <span className="trips-who-name" aria-hidden>
        {name}
      </span>
      <span className="sr-only">
        {en ? 'Driver: ' : 'Chauffeur: '}
        {name}
      </span>
    </span>
  );
}

function Person({
  name,
  role,
  phone,
  email,
  color,
  en,
}: {
  name: string;
  role: string;
  phone: string | null;
  email?: string;
  color?: string;
  en: boolean;
}) {
  const first = name.split(' ')[0];
  return (
    <li className="trips-person">
      <Avatar name={name} color={color ?? driverColorVar(name)} />
      <span className="trips-person-text">
        <span className="trips-person-name">{name}</span>
        <span className="trips-person-role">{role}</span>
      </span>
      <span className="trips-person-actions">
        {phone ? (
          <a
            href={dial(phone)}
            className="trips-round"
            title={`${en ? 'Call' : 'Bel'} ${first}: ${phone}`}
            aria-label={`${en ? 'Call' : 'Bel'} ${first}: ${phone}`}
          >
            <LogisticsIcon name="phone" className="h-4 w-4" strokeWidth={2} />
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="trips-round"
            title={`Mail ${first}: ${email}`}
            aria-label={`Mail ${first}: ${email}`}
          >
            <LogisticsIcon name="mail" className="h-4 w-4" strokeWidth={2} />
          </a>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Eén knop naar de kaart, in de kleur van Google Maps zodat je ze herkent als
 * de knop die de kaart-app opent. Er stond eerst een "kaart"-link achter elk
 * adres; met de route ernaast zeiden die niets meer.
 */
function MapsButton({ url, en }: { url: string | null; en: boolean }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="trips-maps">
      <span className="trips-maps-icon" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]">
          <path d="M12 2.6l9.4 9.4-9.4 9.4L2.6 12z" fill="currentColor" />
          <path
            d="M9 14.5v-2.3a1.7 1.7 0 0 1 1.7-1.7H15M13 8.4l2.1 2.1-2.1 2.1"
            fill="none"
            stroke="var(--on-maps)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      Route in Google Maps
    </a>
  );
}
