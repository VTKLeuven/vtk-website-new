/**
 * De meegeleverde ticketsjablonen: wat een terugkerend evenement telkens
 * opnieuw aan verkoopomgeving nodig heeft.
 *
 * Dit is **de seed**, niet de waarheid. De sjablonen leven in de tabellen
 * `TicketEventTemplate` / `TicketEventTemplateType` /
 * `TicketEventTemplateQuestion` en worden beheerd op /admin/tickets/sjablonen;
 * dit bestand zet ze één keer neer op een lege databank. Die seed is
 * create-only op de slug: een sjabloon dat iemand daarna in de admin aanpaste,
 * mag een herseed niet terugdraaien. Verwacht dus dat deze lijst na de eerste
 * dag afwijkt van de echte site.
 *
 * Alleen data en types, zonder Prisma-import: zowel `prisma/seed.ts` als de
 * webapp leest het.
 *
 *   salesOpensMinutesBefore / salesClosesMinutesBefore
 *                       minuten vóór de start van het event. Bewust een duur en
 *                       geen datum: hetzelfde sjabloon moet op elke dag
 *                       neergezet kunnen worden. 0 = precies bij de start.
 *   durationMinutes     lengte van het event; de eindtijd volgt eruit.
 *   enabled: false      een tickettype dat standaard uitgevinkt staat.
 */

export type BuiltinTicketTemplateType = {
  code: string;
  nameNl: string;
  nameEn?: string;
  descriptionNl?: string;
  descriptionEn?: string;
  /** Prijs in cent; 0 is geldig (gratis ticket). */
  unitPriceCents: number;
  /** Optionele ledenprijs; enkel zinvol bij doelgroep PUBLIC en lager dan de gewone prijs. */
  memberPriceCents?: number | null;
  audience?: "PUBLIC" | "MEMBERS" | "HONORARY";
  /** Sleutel uit `lib/ticketing/ticketColors.ts`. */
  color?: string;
  minPerOrder?: number;
  maxPerOrder?: number;
  salesOpensMinutesBefore?: number | null;
  salesClosesMinutesBefore?: number | null;
  enabled?: boolean;
};

export type BuiltinTicketTemplateQuestion = {
  code: string;
  labelNl: string;
  labelEn?: string;
  descriptionNl?: string;
  descriptionEn?: string;
  type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "BOOLEAN";
  required?: boolean;
  options?: string[];
  /** Enkel bij dit tickettype, op code. */
  ticketTypeCode?: string;
};

export type BuiltinTicketTemplate = {
  slug: string;
  label: string;
  note?: string;
  /** Code van de post waarvoor dit sjabloon typisch dient; enkel een label. */
  groupCode?: string;
  titleNl?: string;
  titleEn?: string;
  descriptionNl?: string;
  descriptionEn?: string;
  location?: string;
  /** Startuur, "HH:mm". */
  timeOfDay?: string;
  durationMinutes?: number;
  salesOpensMinutesBefore?: number | null;
  salesClosesMinutesBefore?: number | null;
  maxTicketsPerOrder?: number;
  contactEmail?: string;
  cardCheckIn?: boolean;
  openScanning?: boolean;
  presaleLeadMinutes?: number | null;
  presalePraesidium?: boolean;
  presaleHelpers?: boolean;
  confirmationMessageNl?: string;
  confirmationMessageEn?: string;
  capacity?: number;
  types: BuiltinTicketTemplateType[];
  questions?: BuiltinTicketTemplateQuestion[];
};

/** Een dag in minuten, zodat de offsets hieronder leesbaar blijven. */
const DAY = 1_440;

export const BUILTIN_TICKET_EVENT_TEMPLATES: BuiltinTicketTemplate[] = [
  {
    slug: "cantus",
    label: "Cantus",
    note: "Vier tickets (bier en water, lid en niet-lid), één ticket per persoon, verkoop drie dagen vooraf.",
    groupCode: "ACTIVITEITEN",
    titleNl: "Cantus",
    titleEn: "Cantus",
    location: "De Waaiberg",
    timeOfDay: "20:00",
    // Deuren om 20:00, Io Vivat om 20:30, gedaan rond middernacht.
    durationMinutes: 300,
    salesOpensMinutesBefore: 3 * DAY,
    salesClosesMinutesBefore: 0,
    // Een cantusticket staat op naam: één per bestelling, zodat niemand een
    // rij tickets koopt en de zaal via via volloopt.
    maxTicketsPerOrder: 1,
    contactEmail: "activiteiten@vtk.be",
    capacity: 160,
    descriptionNl: `Vul hier de sfeertekst van deze cantus in.

📍 Locatie: De Waaiberg, Tervuursevest 60
⏰ Timing:
• Deuren open: 20:00
• Io Vivat: 20:30
📅 Datum: vul de datum in
💰 Prijzen:
• Bier/Sangria: €14 (leden) / €17 (niet-leden)
• Water: €5,50 (leden) / €8,50 (niet-leden)

Tot dan!`,
    confirmationMessageNl:
      "Breng je codex mee en hou je ticket bij de hand aan de inkom. Tot op de cantus!",
    types: [
      {
        code: "BIERLID",
        nameNl: "Bierticket (Lid)",
        nameEn: "Beer ticket (member)",
        unitPriceCents: 1400,
        audience: "MEMBERS",
        maxPerOrder: 1,
      },
      {
        code: "BIERNIETLID",
        nameNl: "Bierticket (Niet-lid)",
        nameEn: "Beer ticket (non-member)",
        unitPriceCents: 1700,
        maxPerOrder: 1,
      },
      {
        code: "WATERLID",
        nameNl: "Waterticket (Lid)",
        nameEn: "Water ticket (member)",
        unitPriceCents: 550,
        audience: "MEMBERS",
        maxPerOrder: 1,
      },
      {
        code: "WATERNIETLID",
        nameNl: "Waterticket (Niet-lid)",
        nameEn: "Water ticket (non-member)",
        unitPriceCents: 850,
        maxPerOrder: 1,
      },
    ],
  },
];
