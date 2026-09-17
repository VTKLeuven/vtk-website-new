'use client';

import Link from 'next/link';
import { useState } from 'react';
import { type DriverColorOverrides } from '@/lib/driver-colors';
import { TransportCalendar } from '@/components/transport-calendar/transport-calendar';
import { TransportFilterBar } from '@/components/transport-calendar/filters';
import { TripInspector } from '@/components/transport-calendar/trip-inspector';
import type { CalendarVehicle, TripBlock } from '@/components/transport-calendar/types';
import type { TransportFilters } from '@/lib/transport-filters';
import type { LogistiekLocale } from '@/lib/i18n-shared';
import { TripCard, type BezettingTrip } from './trip-card';

/**
 * Het publieke bezettingsoverzicht (T8): dezelfde weekkalender als het team
 * ziet, zonder de knoppen.
 *
 * Draait op dezelfde shell als de planning (`TransportCalendar`) en niet meer op
 * een kale `TimeGrid`. Dat is wat dit scherm de drie dingen geeft die het miste
 * en die het team wel had: **volledig scherm** (op een telefoon de dagweergave
 * met vegen en knijpen, en dat is precies het scherm waarop iemand "is de kar
 * vrij?" opzoekt), **zoom**, en **"Weergave"** om te kiezen wat er in een blok
 * staat. De filters komen ernaast in de werkbalk, met enkel de groepen die hier
 * iets betekenen; zie `TransportFilterBar`.
 *
 * De weergavekeuze dag/week/maand staat er níét: deze pagina kent enkel weken
 * (`?week=`), en de shell laat ze daarom weg.
 *
 * Met `trips` erbij (enkel voor Logistiek en IT, zie de pagina) worden de
 * blokken aanklikbaar en opent een rit een leeskaart naast zijn blok: post,
 * chauffeur, waarvoor de rit dient, wat er mee moet. Zonder die lijst is de
 * kalender wat ze was, om naar te kijken: `TimeGrid` maakt een blok pas een knop
 * wanneer er een `onSelect` is.
 */
export function PublicWeek({
  days,
  vehicles,
  blocks,
  emptyLabel,
  showDriver,
  driverColors,
  trips,
  locale,
  manage,
  anchor,
  filters,
  filterVehicles,
  filterDrivers,
  canFilterRequester,
  nav,
}: {
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  emptyLabel: string;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
  /** De ritdetails; weglaten laat de blokken onklikbaar, zoals zonder login. */
  trips?: BezettingTrip[];
  locale: LogistiekLocale;
  /** Logistiek en IT: zij krijgen de link naar het beheer onder het kaartje. */
  manage: boolean;
  /** De maandag van deze week, als ISO-string; de shell wil een ankerdag. */
  anchor: string;
  filters: TransportFilters;
  filterVehicles: Array<{ id: string; name: string }>;
  /**
   * De chauffeurs om op te filteren. Leeg zonder login: dan staat er geen naam
   * op het rooster, en een filterlijst met namen erin zou precies prijsgeven wat
   * de kalender bewust weglaat.
   */
  filterDrivers: Array<{ id: string; name: string }>;
  /** Filteren op post/werkgroep/extern; enkel voor wie de aanvrager al ziet. */
  canFilterRequester: boolean;
  nav: { previousHref: string; nextHref: string; todayHref: string };
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openTrip = trips?.find((trip) => trip.id === openId) ?? null;

  return (
    <TransportCalendar
      view="week"
      anchor={anchor}
      days={days}
      vehicles={vehicles}
      blocks={blocks}
      emptyLabel={emptyLabel}
      showDriver={showDriver}
      driverColors={driverColors}
      onSelect={trips ? setOpenId : undefined}
      selectedId={openId}
      views={false}
      nav={nav}
      toolbarExtra={
        <TransportFilterBar
          filters={filters}
          vehicles={filterVehicles}
          drivers={filterDrivers}
          driverColors={driverColors}
          // Een eigen sleutel: wat je op de planning van het team aanvinkte,
          // hoort dit scherm niet te filteren.
          storageKey="logistiek.bezetting.filters"
          groups={{
            drivers: filterDrivers.length > 0,
            requesters: canFilterRequester,
            // Beide horen bij de planning van het team: hier hangt geen
            // evenementenstrook boven het rooster en geen beschikbaarheidsband
            // erachter.
            events: false,
            availability: false,
          }}
        />
      }
    >
      {openTrip ? (
        <TripInspector
          title={openTrip.title}
          subtitle={openTrip.requester}
          onClose={() => setOpenId(null)}
          anchorId={openTrip.id}
          footer={
            // Enkel voor wie erheen mag: een link die op een 403 uitkomt, is
            // erger dan geen link.
            manage ? (
              <>
                <Link
                  href={`/beheer/vervoer?rit=${openTrip.id}`}
                  className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                >
                  {locale === 'en' ? 'This trip in the admin' : 'Deze rit in het beheer'}
                </Link>
                {locale === 'en'
                  ? ': that is where you decide, assign a driver and complete it.'
                  : ': daar beslis je, wijs je een chauffeur toe en rond je ze af.'}
              </>
            ) : undefined
          }
        >
          <TripCard trip={openTrip} locale={locale} manage={manage} />
        </TripInspector>
      ) : null}
    </TransportCalendar>
  );
}
