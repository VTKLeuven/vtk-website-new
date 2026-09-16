/**
 * De meegeleverde shiftsjablonen: welke shiften een terugkerend evenement nodig
 * heeft.
 *
 * Dit is **de seed**, niet de waarheid. De sjablonen leven in de tabellen
 * `ShiftTemplate` / `ShiftTemplateEntry` en worden beheerd op
 * /admin/shiften/sjablonen/beheer; dit bestand zet ze één keer neer op een lege
 * databank. Net als bij de fixtures is die seed create-only: een sjabloon dat
 * iemand daarna in de admin aanpaste, mag een herseed niet terugdraaien. Verwacht
 * dus dat deze lijst na de eerste dag afwijkt van de echte site.
 *
 * Alleen data en types, zonder Prisma-import: zowel `prisma/seed.ts` als de
 * webapp leest het.
 *
 *   startOffsetMinutes  minuten t.o.v. het startmoment dat in het sjabloonscherm
 *                       ingevuld wordt; negatief = ervoor (opbouw), 0 = de
 *                       eerste shift.
 *   durationMinutes     lengte van de shift.
 *   maxParticipants     aantal plaatsen.
 *   reward              aantal bonnetjes per deelnemer, per shift te zetten: een
 *                       opbouw van een half uur is niet hetzelfde waard als vier
 *                       uur aan de tap.
 *   location            vaste locatie voor deze ene shift: ze volgt de algemene
 *                       locatie bovenaan dan niet meer. Bv. "Bijrijden" vertrekt
 *                       altijd aan de loods. Weglaten = mee met het algemene veld.
 *   ownPost / post      idem voor de post. `ownPost: false` volgt de algemene
 *                       post; `ownPost: true` met `post: null` betekent "geen post".
 *   enabled: false      staat standaard uitgevinkt (bv. een shift die je enkel
 *                       bij een grote editie nodig hebt).
 */

export type BuiltinShiftTemplateEntry = {
  name: string;
  startOffsetMinutes: number;
  durationMinutes: number;
  maxParticipants: number;
  reward: number;
  description: string;
  instructions?: string;
  location?: string;
  ownPost?: boolean;
  post?: string | null;
  openToInternationals?: boolean;
  enabled?: boolean;
};

export type BuiltinShiftTemplate = {
  slug: string;
  label: string;
  note?: string;
  eventName?: string;
  location?: string;
  post?: string | null;
  /** Suggestie voor het uur van de eerste shift, "HH:mm". */
  timeOfDay?: string;
  shifts: BuiltinShiftTemplateEntry[];
};

/** Het sjabloon dat één Theokot-verkoopdag bemant. */
export const THEOKOT_TEMPLATE_SLUG = "theokot";

export const BUILTIN_SHIFT_TEMPLATES: BuiltinShiftTemplate[] = [
  {
    slug: "cantus",
    label: "Cantus",
    note: "Klassieke cantus: opbouw, inkom, bar en tap, afbouw achteraf.",
    eventName: "Cantus",
    location: "Waaiberg",
    post: "ACTIVITEITEN",
    timeOfDay: "20:30",
    shifts: [
      {
        name: "Bijrijden",
        startOffsetMinutes: -150,
        durationMinutes: 60,
        maxParticipants: 2,
        reward: 1,
        // Bijrijden vertrekt altijd aan de loods, waar de cantus ook doorgaat.
        location: "De Loods",
        description: "All het materiaal van de loods naar de cantus brengen \n Adress loods: tervuursevest 238",
      },
      {
        name: "Opbouw",
        startOffsetMinutes: -90,
        durationMinutes: 60,
        maxParticipants: 6,
        reward: 2,
        description: "Zaal klaarzetten: tafels, stoelen, podia,...",
      },
      {
        name: "Inkom",
        startOffsetMinutes: -30,
        durationMinutes: 30,
        maxParticipants: 2,
        reward: 1,
        description: "Tickets scannen en Polsbandjes uitdelen",
      },
      {
        name: "Tappen en rondbrengen",
        startOffsetMinutes: 0,
        durationMinutes: 90,
        maxParticipants: 4,
        reward: 2,
        description: "Bier tappen en de kannen rondbrengen",
      },
      {
        name: "Pispolitie",
        startOffsetMinutes: 0,
        durationMinutes: 90,
        maxParticipants: 2,
        reward: 2,
        description: "Mensen die naar het toilet willen een strafje geven",
      },
      {
        name: "Stewarden",
        startOffsetMinutes: 90,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: "Zorgen dat er niemand luid is buiten en fiksen dat er geen drank buiten geraakt",
      },
      {
        name: "Bandjes controleren",
        startOffsetMinutes: 90,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: "Bandjes controleren tijdens de tempus",
      },
      {
        name: "Tappen en rondbrengen",
        startOffsetMinutes: 105,
        durationMinutes: 105,
        maxParticipants: 4,
        reward: 2,
        description: "Bier tappen en de kannen rondbrengen",
      },
      {
        name: "Pispolitie",
        startOffsetMinutes: 105,
        durationMinutes: 105,
        maxParticipants: 2,
        reward: 2,
        description: "Mensen die naar het toilet willen een strafje geven",
      },
      {
        name: "Stewarden",
        startOffsetMinutes: 210,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: "Zorgen dat er niemand luid is buiten en fiksen dat er geen drank buiten geraakt",
      },
      {
        name: "Bandjes controleren",
        startOffsetMinutes: 210,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: "Bandjes controleren tijdens de tempus",
      },
      {
        name: "Corona stilhouden",
        startOffsetMinutes: 225,
        durationMinutes: 45,
        maxParticipants: 2,
        reward: 1,
        description: "De corona stilhouden voor het 3de deel",
      },
      {
        name: "Afbraak",
        startOffsetMinutes: 270,
        durationMinutes: 60,
        maxParticipants: 5,
        reward: 2,
        description: "Please help ons mee en zorg dat we na een half uurtje klaar kunnen zijn :))",
      },
      {
        name: "Bijrijden",
        startOffsetMinutes: 330,
        durationMinutes: 60,
        maxParticipants: 2,
        reward: 2,
        // Bijrijden vertrekt altijd aan de loods, waar de cantus ook doorgaat.
        location: "De Loods",
        description: "All het materiaal terug naar de loods brengen \n Adress loods: tervuursevest 238",
      },
    ],
  },
  {
    slug: THEOKOT_TEMPLATE_SLUG,
    label: "Theokot opening",
    note: "Standaard template voor 1 dag in Theokot (smeren, middag, namiddag)",
    eventName: "",
    location: "Theokot",
    post: "THEOKOT",
    timeOfDay: "10:30",
    shifts: [
      {
        name: "Broodjes Smeren",
        startOffsetMinutes: 0,
        durationMinutes: 120,
        maxParticipants: 4,
        reward: 2,
        description:
          "Kom gezellig mee broodjes smeren in het Theokot ;)) Als reward mag je ook zelf je eigen broodje samenstellen en smeren!",
        openToInternationals: true,
      },
      {
        name: "Broodjes verkopen",
        startOffsetMinutes: 120,
        durationMinutes: 90,
        maxParticipants: 4,
        reward: 2,
        description: "Broodjes en croques verkopen over de middag",
        openToInternationals: false,
      },
      {
        name: "Namiddag verkoop",
        startOffsetMinutes: 210,
        durationMinutes: 120,
        maxParticipants: 2,
        reward: 2,
        description: "De namiddag verkoop voor theokot, kom gezellig wat chillen :))",
      },
    ],
  },
];
