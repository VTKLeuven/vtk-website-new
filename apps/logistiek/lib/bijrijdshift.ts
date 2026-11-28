/**
 * Een bijrijdshift aanmaken vanuit een rit: de shift op vtk.be/shift waarop een
 * lid zich inschrijft om mee te rijden, gekoppeld aan de rit met
 * `Shift.transportBookingId` (zie docs/design-decisions.md, "Een bijrijdshift
 * kent haar rit").
 *
 * Puur en zonder database: wat er in de shift komt, staat hier, zodat de test
 * het kan nakijken zonder een rit aan te maken. De action
 * (`createTripShiftAction`) leest de rit, kijkt de rechten na en schrijft.
 *
 * **Enkel plaatsen en bonnetjes vraagt het formulier.** De rest volgt uit de
 * rit: de uren, de post waarvoor de shift telt, waar je vertrekt. Wie meer wil
 * aanpassen (een langere uitleg, een Engelse tekst), doet dat daarna in
 * /admin/shiften; hier gaat het om een rit die morgen vertrekt en nog iemand
 * nodig heeft.
 */

/** De grenzen van het formulier; vtk.be zelf vraagt enkel minstens één plaats. */
export const TRIP_SHIFT_PLACES = { min: 1, max: 8, default: 1 } as const;
export const TRIP_SHIFT_REWARD = { min: 0, max: 5, default: 1 } as const;

export type TripShiftInput = { places: number; reward: number };

/** Wat de shift uit de rit haalt. */
export type TripForShift = {
  id: string;
  purpose: string;
  startAt: Date;
  endAt: Date;
  pickupAddress: string | null;
  destination: string | null;
  vehicle: { nameNl: string; nameEn: string };
  /** De post of werkgroep die de rit aanvroeg; daar telt de shift voor. */
  group: { code: string; nameNl: string; nameEn: string } | null;
};

/** De rijen die `prisma.shift.create` krijgt, zonder de id's die Prisma zelf zet. */
export type TripShiftData = {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  location: string;
  startTime: Date;
  endTime: Date;
  maxParticipants: number;
  reward: number;
  post: string | null;
  openToInternationals: boolean;
  instructions: null;
  transportBookingId: string;
};

/**
 * Plaatsen en bonnetjes nakijken. Geeft de fout terug in plaats van te gooien:
 * een 0 in het veld is een invoerfout, geen serverfout (zie CLAUDE.md, "Opslaan
 * meldt altijd zijn uitkomst").
 */
export function parseTripShiftInput(
  input: unknown
): { ok: true; value: TripShiftInput } | { ok: false; error: string } {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const places = Number(record.places);
  const reward = Number(record.reward);
  if (!Number.isInteger(places) || places < TRIP_SHIFT_PLACES.min || places > TRIP_SHIFT_PLACES.max) {
    return {
      ok: false,
      error: `Kies tussen ${TRIP_SHIFT_PLACES.min} en ${TRIP_SHIFT_PLACES.max} plaatsen.`,
    };
  }
  if (!Number.isInteger(reward) || reward < TRIP_SHIFT_REWARD.min || reward > TRIP_SHIFT_REWARD.max) {
    return {
      ok: false,
      error: `Kies tussen ${TRIP_SHIFT_REWARD.min} en ${TRIP_SHIFT_REWARD.max} bonnetjes.`,
    };
  }
  return { ok: true, value: { places, reward } };
}

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/**
 * De shift voor deze rit. De uren zijn die van de rit: wie meerijdt, is er van
 * vertrek tot terugkeer. Waar je je meldt, is het laadadres als dat er is (daar
 * stapt een bijrijder in), anders de bestemming.
 */
export function tripShiftData(trip: TripForShift, input: TripShiftInput): TripShiftData {
  const purpose = trip.purpose.trim() || trip.vehicle.nameNl;
  const forNl = trip.group ? ` voor ${trip.group.nameNl}` : '';
  const forEn = trip.group ? ` for ${trip.group.nameEn}` : '';
  const toNl = trip.destination ? `, naar ${trip.destination}` : '';
  const toEn = trip.destination ? `, to ${trip.destination}` : '';
  return {
    name: clip(`Bijrijden: ${purpose}`, 120),
    nameEn: clip(`Ride along: ${purpose}`, 120),
    description: clip(
      `Rij mee met de ${trip.vehicle.nameNl.toLowerCase()} van de uitleendienst${forNl}${toNl}. ` +
        'Zodra je ingeschreven bent, zie je hier wie er rijdt en op welk nummer.',
      500
    ),
    descriptionEn: clip(
      `Ride along in the ${trip.vehicle.nameEn.toLowerCase()} of the lending service${forEn}${toEn}. ` +
        'Once you have signed up, you see here who drives and on which number.',
      500
    ),
    location: clip(trip.pickupAddress?.trim() || trip.destination?.trim() || 'Uitleendienst', 200),
    startTime: trip.startAt,
    endTime: trip.endAt,
    maxParticipants: input.places,
    reward: input.reward,
    post: trip.group?.code ?? null,
    openToInternationals: false,
    instructions: null,
    transportBookingId: trip.id,
  };
}

/**
 * Staat de shift nog op de uren van de rit? De shift neemt ze over bij het
 * aanmaken en volgt daarna niet vanzelf: een rit wordt op tien plaatsen
 * verschoven (slepen, aanpassen, goedkeuren met andere uren). Het blok bij de rit
 * zegt het wanneer ze uit elkaar liggen, met een knop om de shift mee te nemen.
 */
export function shiftMatchesTrip(
  shift: { startAt: string | Date; endAt: string | Date },
  trip: { startAt: string | Date; endAt: string | Date }
): boolean {
  const time = (value: string | Date) => new Date(value).getTime();
  return time(shift.startAt) === time(trip.startAt) && time(shift.endAt) === time(trip.endAt);
}

/**
 * Mag deze persoon een bijrijdshift zetten op deze rit? Het team, de aanvrager,
 * of een lid van de post die de rit aanvroeg. Strenger dan de bijrijders: een
 * post waaraan de rit doorgegeven is (`assignedGroupId`) rijdt ze, maar de shift
 * telt voor de aanvragende post, en die zet een andere post niet.
 */
export function mayCreateTripShift(
  viewer: { userId: string; groupIds: readonly string[]; manages: boolean },
  trip: { userId: string; groupId: string | null }
): boolean {
  if (viewer.manages || trip.userId === viewer.userId) return true;
  return trip.groupId !== null && viewer.groupIds.includes(trip.groupId);
}

