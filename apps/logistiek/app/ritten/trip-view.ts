import type { TripHelper } from '@/components/trip-helpers';
import type { TripNoteView } from '@/components/trip-notes';
import type { VehicleIcon } from '@/lib/vehicle-icon';

/**
 * Een rit zoals "Mijn ritten" hem tekent: alles al in woorden en in Belgische
 * tijd, zodat de lijst in de browser enkel nog filtert en openklapt.
 *
 * Alles wat hier staat, komt in de HTML. Er staat daarom niets in wat de kijker
 * niet al op de oude kaart zag: geen prijs, geen betaalstatus.
 */
export type TripDriverView =
  | { kind: 'me' }
  | { kind: 'other'; name: string; phone: string | null; color: string }
  /** Er moet nog iemand op, en dat is nog niet gebeurd. */
  | { kind: 'none' }
  /** De bakfiets: de aanvrager neemt hem zelf mee (`needsDriver`). */
  | { kind: 'notNeeded' };

export type TripView = {
  id: string;
  /** De maandag van de week, "YYYY-MM-DD"; enkel om te groeperen. */
  weekKey: string;
  dayShort: string;
  dayNumber: string;
  /** Voluit, voor een schermlezer: "zondag 15 november". */
  dayLong: string;
  /** Vandaag, of al bezig. */
  today: boolean;
  hours: string;
  /** "tot do 26" wanneer de rit over middernacht gaat. */
  hoursUntil: string | null;
  vehicleName: string;
  vehicleIcon: VehicleIcon;
  purpose: string;
  /** De post (of bij een externe aanvraag de naam) waarvoor gereden wordt. */
  requester: string | null;
  eventName: string | null;
  pickup: string | null;
  destination: string | null;
  cargoNote: string | null;
  adminNote: string | null;
  memberNote: string | null;
  contact: { name: string; role: string; email: string; phone: string | null };
  driver: TripDriverView;
  helpers: TripHelper[];
  /** De vrije tekst van vóór V2 over helpers, met het nummer erbij. */
  helpersLegacy: string | null;
  canEditHelpers: boolean;
  notes: TripNoteView[];
  /** Jij rijdt deze rit. */
  mine: boolean;
  /** De rit is van je post: aangevraagd door of doorgegeven aan. */
  post: boolean;
  /** Doorgegeven aan je post: dan kies je hier zelf de chauffeur. */
  picker: { groupName: string; driverId: string | null; members: Array<{ id: string; name: string }> } | null;
  completed: boolean;
  /** Alles waarop je kan zoeken, in kleine letters. */
  searchText: string;
};

export type TripWeek = { key: string; label: string; range: string; trips: TripView[] };

export type TripMonth = { key: string; label: string; trips: TripView[] };
