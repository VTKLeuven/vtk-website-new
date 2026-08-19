/**
 * De shiftsjablonen: welke shiften een terugkerend evenement nodig heeft.
 *
 * Dit bestand is de enige plek waar dat staat. Het scherm
 * /admin/shiften/sjablonen bouwt er een formulier mee, en het aanmaken van een
 * Theokot-verkoopweek zet er de shiften van een verkoopdag mee neer. Stonden ze
 * op twee plaatsen, dan zou een aangepaste Theokot-shift in het ene scherm wel
 * en in het andere niet meegaan.
 *
 * Alleen data en types: dit wordt zowel door een client component als door een
 * server action geïmporteerd. De rest van `lib/shift/` mag wél de databank en
 * server-only code aanraken; hou dat hier buiten.
 */

import { brusselsTimeOnDay } from '@/lib/brussels';
import type { ShiftInput } from '@/lib/shift';

export type ShiftTemplateEntry = {
  /** Stabiele sleutel binnen het sjabloon; enkel voor React-keys en leesbaarheid. */
  key: string;
  /** Naam van de shift, zonder de evenementnaam erachter ("Bar 1"). */
  name: string;
  /** Minuten t.o.v. het gekozen startmoment; negatief = ervoor (opbouw). */
  startOffsetMinutes: number;
  durationMinutes: number;
  maxParticipants: number;
  /**
   * Aantal bonnetjes per deelnemer. Verplicht per shift, en bewust geen waarde
   * die het sjabloon centraal zet: een opbouw van een half uur is niet hetzelfde
   * waard als vier uur aan de tap, dus die keuze hoort bij de shift zelf.
   */
  reward: number;
  description: string;
  instructions?: string;
  /** Enkel invullen wanneer deze shift van de globale locatie/post afwijkt. */
  location?: string;
  post?: string | null;
  openToInternationals?: boolean;
  /** `false` = staat standaard uitgevinkt. */
  enabled?: boolean;
};

export type ShiftTemplate = {
  id: string;
  label: string;
  /** Eén regel uitleg onder de keuzelijst. */
  note?: string;
  defaults: {
    eventName: string;
    location: string;
    post?: string | null;
    /** Suggestie voor het uur van de eerste shift, "HH:mm". */
    timeOfDay?: string;
  };
  shifts: ShiftTemplateEntry[];
};

// -----------------------------------------------------------------------------
// De sjablonen zelf.
//
// Evenementen die telkens terugkeren (een cantus, een bar-avond, een TD) hebben
// elke keer dezelfde reeks shiften; enkel datum, uur en soms de locatie
// verschillen. Zet zo'n reeks hier één keer neer en de rest van deze pagina doet
// het rekenwerk.
//
// Een sjabloon toevoegen = een blok in deze lijst bijzetten. Er is bewust geen
// beheerscherm voor: dit verandert hooguit een paar keer per werkingsjaar, en
// een lijst in de code is dan makkelijker te lezen (en te reviewen) dan een
// tabel in de databank.
//
//   startOffsetMinutes  minuten t.o.v. het startmoment dat je bovenaan invult;
//                       negatief = ervoor (opbouw), 0 = de eerste shift.
//   durationMinutes     lengte van de shift.
//   maxParticipants     aantal plaatsen.
//   reward              aantal bonnetjes per deelnemer, per shift te zetten: een
//                       opbouw van een half uur is niet hetzelfde waard als vier
//                       uur aan de tap.
//   location / post     vaste locatie/post voor deze ene shift: ze volgt de
//                       globale locatie/post bovenaan dan niet meer. Bv.
//                       "Bijrijden" vertrekt altijd aan de loods, waar de cantus
//                       zelf ook doorgaat. Weglaten = mee met het globale veld.
//                       In het scherm blijft ze gewoon aanpasbaar.
//   enabled: false      staat standaard uitgevinkt (bv. een shift die je enkel
//                       bij een grote editie nodig hebt).
// -----------------------------------------------------------------------------

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  {
    id: 'cantus',
    label: 'Cantus',
    note: 'Klassieke cantus: opbouw, inkom, bar en tap, afbouw achteraf.',
    defaults: {
      eventName: 'Cantus',
      location: 'Waaiberg',
      post: 'ACTIVITEITEN',
      timeOfDay: '20:30',
    },
    shifts: [
      {
        key: 'bijrijden-1',
        name: 'Bijrijden',
        startOffsetMinutes: -150,
        durationMinutes: 60,
        maxParticipants: 2,
        reward: 1,
        // Bijrijden vertrekt altijd aan de loods, waar de cantus ook doorgaat.
        location: 'De Loods',
        description: 'All het materiaal van de loods naar de cantus brengen \n Adress loods: tervuursevest 238',
      },
      {
        key: 'opbouw',
        name: 'Opbouw',
        startOffsetMinutes: -90,
        durationMinutes: 60,
        maxParticipants: 6,
        reward: 2,
        description: 'Zaal klaarzetten: tafels, stoelen, podia,...',
      },
      {
        key: 'inkom',
        name: 'Inkom',
        startOffsetMinutes: -30,
        durationMinutes: 30,
        maxParticipants: 2,
        reward: 1,
        description: 'Tickets scannen en Polsbandjes uitdelen',
      },
      {
        key: 'tap-1',
        name: 'Tappen en rondbrengen',
        startOffsetMinutes: 0,
        durationMinutes: 90,
        maxParticipants: 4,
        reward: 2,
        description: 'Bier tappen en de kannen rondbrengen',
      },
      {
        key: 'pis-1',
        name: 'Pispolitie',
        startOffsetMinutes: 0,
        durationMinutes: 90,
        maxParticipants: 2,
        reward: 2,
        description: 'Mensen die naar het toilet willen een strafje geven',
      },
      {
        key: 'steward-1',
        name: 'Stewarden',
        startOffsetMinutes: 90,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Zorgen dat er niemand luid is buiten en fiksen dat er geen drank buiten geraakt',
      },
      {
        key: 'controle-1',
        name: 'Bandjes controleren',
        startOffsetMinutes: 90,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Bandjes controleren tijdens de tempus',
      },
      {
        key: 'tap-2',
        name: 'Tappen en rondbrengen',
        startOffsetMinutes: 105,
        durationMinutes: 105,
        maxParticipants: 4,
        reward: 2,
        description: 'Bier tappen en de kannen rondbrengen',
      },
      {
        key: 'pis-2',
        name: 'Pispolitie',
        startOffsetMinutes: 105,
        durationMinutes: 105,
        maxParticipants: 2,
        reward: 2,
        description: 'Mensen die naar het toilet willen een strafje geven',
      },
      {
        key: 'steward-2',
        name: 'Stewarden',
        startOffsetMinutes: 210,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Zorgen dat er niemand luid is buiten en fiksen dat er geen drank buiten geraakt',
      },
      {
        key: 'controle-2',
        name: 'Bandjes controleren',
        startOffsetMinutes: 210,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Bandjes controleren tijdens de tempus',
      },
      {
        key: 'stilhouden',
        name: 'Corona stilhouden',
        startOffsetMinutes: 225,
        durationMinutes: 45,
        maxParticipants: 2,
        reward: 1,
        description: 'De corona stilhouden voor het 3de deel',
      },
      {
        key: 'afbouw',
        name: 'Afbraak',
        startOffsetMinutes: 270,
        durationMinutes: 60,
        maxParticipants: 5,
        reward: 2,
        description: 'Please help ons mee en zorg dat we na een half uurtje klaar kunnen zijn :))',
      },
      {
        key: 'bijrijden-2',
        name: 'Bijrijden',
        startOffsetMinutes: 330,
        durationMinutes: 60,
        maxParticipants: 2,
        reward: 2,
        // Bijrijden vertrekt altijd aan de loods, waar de cantus ook doorgaat.
        location: 'De Loods',
        description: 'All het materiaal terug naar de loods brengen \n Adress loods: tervuursevest 238',
      },
    ],
  },
  {
    id: 'theokot',
    label: 'Theokot opening',
    note: 'Standaard template voor 1 dag in Theokot (smeren, middag, namiddag)',
    defaults: {
      eventName: '',
      location: 'Theokot',
      post: 'THEOKOT',
      timeOfDay: '10:30',
    },
    shifts: [
      {
        key: 'smeren',
        name: 'Broodjes Smeren',
        startOffsetMinutes: 0,
        durationMinutes: 120,
        maxParticipants: 4,
        reward: 2,
        description:
          'Kom gezellig mee broodjes smeren in het Theokot ;)) Als reward mag je ook zelf je eigen broodje samenstellen en smeren!',
        openToInternationals: true,
      },
      {
        key: 'middag',
        name: 'Broodjes verkopen',
        startOffsetMinutes: 120,
        durationMinutes: 90,
        maxParticipants: 4,
        reward: 2,
        description: 'Broodjes en croques verkopen over de middag',
        openToInternationals: false,
      },
      {
        key: 'namiddag',
        name: 'Namiddag verkoop',
        startOffsetMinutes: 210,
        durationMinutes: 120,
        maxParticipants: 2,
        reward: 2,
        description: 'De namiddag verkoop voor theokot, kom gezellig wat chillen :))',
      },
    ],
  },
];

/**
 * De shiftnaam komt eerst, het evenement erachter: "Inkom - Cantus". Wat je in een
 * lijst van shiften zoekt, is wat je gaat doen; het evenement is de context erbij.
 */
export const composeName = (eventName: string, baseName: string) =>
  eventName.trim() === '' ? baseName : `${baseName} - ${eventName.trim()}`;

/** Het sjabloon dat één Theokot-verkoopdag bemant. */
export const THEOKOT_TEMPLATE_ID = 'theokot';

/**
 * De shiften die bij één Theokot-verkoopdag horen, klaar om aangemaakt te worden.
 *
 * Het anker is het uur waarop die dag afgehaald kan worden (`pickupStart` van de
 * verkoopdag), niet het vaste uur uit het sjabloon: zet je een dag later open,
 * dan schuiven smeren, middag en namiddag mee. De offsets komen wél uit het
 * sjabloon, zodat het scherm /admin/shiften/sjablonen en een verkoopweek exact
 * dezelfde dag neerzetten.
 *
 * Het optellen gebeurt in echte minuten op één kalenderdag. Dat mag hier: de
 * zomertijd verspringt om 03:00 en geen enkele Theokot-shift raakt dat uur.
 */
export function theokotShiftsForDay(day: Date, pickupStart: string): ShiftInput[] {
  const template = SHIFT_TEMPLATES.find((t) => t.id === THEOKOT_TEMPLATE_ID);
  if (!template) return [];

  const anchor = brusselsTimeOnDay(day, pickupStart);

  return template.shifts
    // Een shift die in het sjabloon standaard uitgevinkt staat, hoort ook hier
    // niet bij de gewone dag: iemand moet ze bewust aanzetten.
    .filter((entry) => entry.enabled !== false)
    .map((entry) => {
      const startTime = new Date(anchor.getTime() + entry.startOffsetMinutes * 60_000);
      return {
        name: composeName(template.defaults.eventName, entry.name),
        startTime,
        endTime: new Date(startTime.getTime() + entry.durationMinutes * 60_000),
        location: entry.location ?? template.defaults.location,
        description: entry.description,
        maxParticipants: entry.maxParticipants,
        reward: entry.reward,
        post: entry.post ?? template.defaults.post ?? null,
        openToInternationals: entry.openToInternationals ?? false,
        instructions: entry.instructions ?? null,
      };
    });
}

/** De post waaronder een Theokot-verkoopdag bemand wordt, of null. */
export function theokotShiftPost(): string | null {
  const template = SHIFT_TEMPLATES.find((t) => t.id === THEOKOT_TEMPLATE_ID);
  return template?.defaults.post ?? null;
}
