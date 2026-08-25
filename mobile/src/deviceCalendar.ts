import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

/**
 * Een evenement in de agenda van de telefoon zetten.
 *
 * **Waarom dit een native module waard is.** De site heeft al een ICS-feed, en
 * die blijft de juiste weg voor wie zijn hele VTK-kalender wil abonneren. Maar
 * "zet dit ene ding in mijn agenda" is iets anders: dat doe je terwijl je naar
 * een evenement kijkt, en dan wil je niet naar je account, een token maken, en
 * dat in een agenda-app plakken. Eén tik, en het staat erin met een herinnering.
 *
 * Er wordt **niets gelezen**. De toestemming die het besturingssysteem vraagt is
 * er een voor lezen én schrijven (daar valt niet aan te ontkomen), maar deze
 * module zoekt niets op, haalt niets op en verwijdert niets. Ze maakt één afspraak
 * op het moment dat je erom vraagt.
 */

export type AddResult =
  | { ok: true; calendarTitle: string }
  | { ok: false; reason: 'denied' | 'no-calendar' | 'failed' };

/**
 * De agenda waar de afspraak in belandt.
 *
 * Op iOS is dat de standaardagenda voor nieuwe afspraken; die kiest de gebruiker
 * zelf in de systeeminstellingen, en daar hoort een app niet overheen te gaan. Op
 * Android bestaat dat begrip niet, dus zoeken we de eerste agenda waar we in
 * mogen schrijven en die bij een echt account hoort. Een lokale agenda aanmaken
 * zou betekenen dat de afspraak niet synchroniseert met de rest van je toestellen.
 */
async function targetCalendar(): Promise<Calendar.Calendar | null> {
  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (defaultCalendar?.allowsModifications) return defaultCalendar;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((calendar) => calendar.allowsModifications);

  return (
    writable.find(
      (calendar) => calendar.accessLevel === Calendar.CalendarAccessLevel.OWNER && calendar.source?.name,
    ) ??
    writable[0] ??
    null
  );
}

export async function addEventToDeviceCalendar(event: {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  notes?: string | null;
}): Promise<AddResult> {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== 'granted') return { ok: false, reason: 'denied' };

  const calendar = await targetCalendar().catch(() => null);
  if (!calendar) return { ok: false, reason: 'no-calendar' };

  try {
    await Calendar.createEventAsync(calendar.id, {
      title: event.title,
      startDate: new Date(event.start),
      endDate: new Date(event.end),
      allDay: event.allDay,
      location: event.location ?? undefined,
      notes: event.notes ?? undefined,
      // De tijdzone staat er expliciet bij. De server stuurt UTC-instants, maar
      // een agenda toont wandkloktijd; zonder dit zou een evenement bij iemand
      // die in een andere zone staat op het verkeerde uur belanden.
      timeZone: 'Europe/Brussels',
      // Een uur vooraf. Genoeg om nog te vertrekken, niet zo vroeg dat het
      // vergeten is tegen het begint.
      alarms: [{ relativeOffset: -60 }],
    });
    return { ok: true, calendarTitle: calendar.title };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** De zin die bij een mislukking hoort. */
export function addResultMessage(result: Extract<AddResult, { ok: false }>): string {
  switch (result.reason) {
    case 'denied':
      return 'VTK mag niet aan je agenda. Dat kan je aanzetten in de instellingen van je telefoon.';
    case 'no-calendar':
      return 'Er staat geen agenda op dit toestel waar iets in geschreven kan worden.';
    default:
      return 'De afspraak kon niet aangemaakt worden.';
  }
}
