'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { LogistiekLocale } from '@/lib/i18n-shared';
import type { RequesterType, TripStatus } from '@/lib/transport-filters';
import type { TripBlockField } from './types';

/**
 * De teksten van de transportkalender, in beide talen (N3).
 *
 * De kalender is gedeeld: de planning van het team (altijd Nederlands, zoals
 * het hele beheer) en de publieke bezetting en het intekenscherm op de
 * ledenkant, die de taal van de bezoeker volgen. Die laatste toonden in het
 * Engels toch "Weergave", "Inzoomen", "geen chauffeur" en Nederlandse
 * dagkoppen. `TransportCalendar` neemt een `locale` (standaard Nederlands) en
 * geeft ze via deze context door; wie de kalender in het beheer gebruikt,
 * merkt er niets van.
 */
const COPY = {
  nl: {
    view: 'Weergave',
    menu: 'Meer',
    days: 'Dagen',
    dayCount: 'Aantal dagen',
    zoomOut: 'Uitzoomen',
    zoomOutHint: 'Uitzoomen (of Ctrl/⌘ + scrollen)',
    zoomIn: 'Inzoomen',
    zoomInHint: 'Inzoomen (of Ctrl/⌘ + scrollen)',
    wholeDay: 'Hele dag',
    backToWholeDay: 'Terug naar de hele dag',
    fullscreen: 'Volledig scherm',
    fullscreenClose: 'Volledig scherm sluiten',
    fullscreenCloseEsc: 'Volledig scherm sluiten (Esc)',
    dayView: 'Dagweergave',
    dayViewFullscreen: 'Dagweergave op volledig scherm',
    choose: (unit: string) => `${unit} kiezen`,
    previous: (unit: string) => `Vorige ${unit}`,
    next: (unit: string) => `Volgende ${unit}`,
    today: 'Vandaag',
    noDriver: 'geen chauffeur',
    noDriverYet: 'nog geen chauffeur',
    drivesThemselves: 'rijdt zelf',
    requesterDrives: 'de aanvrager rijdt zelf',
    eventPrefix: 'evenement',
    driverPrefix: 'chauffeur',
    to: 'tot',
    toward: 'naar',
    cargo: 'lading',
    clashesWith: (title: string) => `Botst met ${title}`,
    filters: 'Filters',
    filterVehicle: 'Voertuig',
    filterDriver: 'Chauffeur',
    filterNoDriver: 'Nog geen',
    filterPost: 'Post of werkgroep',
    filterStatus: 'Status',
    filterRequester: 'Aanvrager',
    filterEvents: 'Evenementen boven de kalender',
    filterAvailability: 'Beschikbaarheid van de chauffeurs',
    filterAvailabilityHint:
      'Als lichte band achter het rooster, in de kleur van de chauffeur. Wie niets ingaf, staat er niet: dat betekent niet dat hij niet kan.',
    showAll: 'Alles tonen',
    close: 'Sluiten',
    inBlock: 'In het blok',
    shortBlockHint:
      'Een kort blok toont enkel de bovenste regels die passen; de rest staat in de tooltip en in het paneel van de rit.',
    standard: 'Standaard',
    events: 'Events',
    timeUnknown: 'uur nog niet gekend',
    showLess: 'Minder tonen',
    more: (count: number) => `+${count} meer`,
    addTripOnDay: 'Rit toevoegen op deze dag',
    chooseDay: 'Dag kiezen',
    swipeHint: 'Veeg voor een andere dag, knijp om de uren groter te maken.',
    status: { REQUESTED: 'Te beslissen', APPROVED: 'Goedgekeurd', COMPLETED: 'Afgerond' } satisfies Record<
      TripStatus,
      string
    >,
    requester: { INTERN: 'Post', WERKGROEP: 'Werkgroep', EXTERN: 'Extern' } satisfies Record<RequesterType, string>,
    field: {
      time: 'Uur',
      title: 'Waarvoor',
      event: 'Evenement',
      vehicle: 'Voertuig',
      driver: 'Chauffeur',
      requester: 'Post of werkgroep',
      destination: 'Bestemming',
      cargo: 'Lading',
    } satisfies Record<TripBlockField, string>,
  },
  en: {
    view: 'View',
    menu: 'More',
    days: 'Days',
    dayCount: 'Number of days',
    zoomOut: 'Zoom out',
    zoomOutHint: 'Zoom out (or Ctrl/⌘ + scroll)',
    zoomIn: 'Zoom in',
    zoomInHint: 'Zoom in (or Ctrl/⌘ + scroll)',
    wholeDay: 'Whole day',
    backToWholeDay: 'Back to the whole day',
    fullscreen: 'Full screen',
    fullscreenClose: 'Close full screen',
    fullscreenCloseEsc: 'Close full screen (Esc)',
    dayView: 'Day view',
    dayViewFullscreen: 'Day view in full screen',
    choose: (unit: string) => `Choose ${unit}`,
    previous: (unit: string) => `Previous ${unit}`,
    next: (unit: string) => `Next ${unit}`,
    today: 'Today',
    noDriver: 'no driver',
    noDriverYet: 'no driver yet',
    drivesThemselves: 'drives themselves',
    requesterDrives: 'the requester drives',
    eventPrefix: 'event',
    driverPrefix: 'driver',
    to: 'to',
    toward: 'to',
    cargo: 'cargo',
    clashesWith: (title: string) => `Clashes with ${title}`,
    filters: 'Filters',
    filterVehicle: 'Vehicle',
    filterDriver: 'Driver',
    filterNoDriver: 'None yet',
    filterPost: 'Post or work group',
    filterStatus: 'Status',
    filterRequester: 'Requester',
    filterEvents: 'Events above the calendar',
    filterAvailability: 'Driver availability',
    filterAvailabilityHint:
      'As a light band behind the grid, in the driver’s colour. Whoever entered nothing is not shown: that does not mean they cannot drive.',
    showAll: 'Show all',
    close: 'Close',
    inBlock: 'In the block',
    shortBlockHint:
      'A short block only shows the top lines that fit; the rest is in the tooltip and in the trip panel.',
    standard: 'Default',
    events: 'Events',
    timeUnknown: 'time not known yet',
    showLess: 'Show less',
    more: (count: number) => `+${count} more`,
    addTripOnDay: 'Add a trip on this day',
    chooseDay: 'Choose a day',
    swipeHint: 'Swipe for another day, pinch to make the hours bigger.',
    status: { REQUESTED: 'To decide', APPROVED: 'Approved', COMPLETED: 'Completed' } satisfies Record<
      TripStatus,
      string
    >,
    requester: { INTERN: 'Post', WERKGROEP: 'Work group', EXTERN: 'External' } satisfies Record<
      RequesterType,
      string
    >,
    field: {
      time: 'Time',
      title: 'Purpose',
      event: 'Event',
      vehicle: 'Vehicle',
      driver: 'Driver',
      requester: 'Post or work group',
      destination: 'Destination',
      cargo: 'Cargo',
    } satisfies Record<TripBlockField, string>,
  },
} as const;

/** Twee keer dezelfde opties, per taal; voor de datumkoppen van elk deel. */
export function byLocale(options: Intl.DateTimeFormatOptions): Record<LogistiekLocale, Intl.DateTimeFormat> {
  return {
    nl: new Intl.DateTimeFormat('nl-BE', options),
    en: new Intl.DateTimeFormat('en-GB', options),
  };
}

export type CalendarCopy = (typeof COPY)[LogistiekLocale] & { locale: LogistiekLocale };

const BUILT: Record<LogistiekLocale, CalendarCopy> = {
  nl: { ...COPY.nl, locale: 'nl' },
  en: { ...COPY.en, locale: 'en' },
};

const CalendarCopyContext = createContext<CalendarCopy>(BUILT.nl);

export function CalendarCopyProvider({ locale, children }: { locale: LogistiekLocale; children: ReactNode }) {
  return <CalendarCopyContext.Provider value={BUILT[locale]}>{children}</CalendarCopyContext.Provider>;
}

/** De teksten van de kalender; buiten een provider Nederlands, zoals het beheer. */
export function useCalendarCopy(): CalendarCopy {
  return useContext(CalendarCopyContext);
}
