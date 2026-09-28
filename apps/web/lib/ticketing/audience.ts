/**
 * Wie mag een ticketsoort zien en kopen?
 *
 * Bewust een los, puur bestand: dezelfde regel wordt op drie plaatsen gelezen
 * (de publieke shop in `queries.ts`, het slot bij het afrekenen in `orders.ts`
 * en het beheerformulier), en ze stond er tot nu toe twee keer in een eigen
 * vorm. Zo groeien ze niet uit elkaar en zijn ze zonder database te testen.
 */

import type { StudyYear } from "@prisma/client";
import { studyConfirmationYear } from "@vtk/auth";
import { audiencesForStudyProfile } from "@/lib/calendar/audienceProfile";

/**
 * De doelgroepen uit het studieprofiel, in de volgorde van het beheerformulier.
 * Dezelfde vier als de kalender (`CalendarAudience`), met dezelfde afleiding.
 */
export const TICKET_TARGET_AUDIENCES = [
  "FIRST_YEARS",
  "LAST_YEARS",
  "INTERNATIONALS",
  "ALUMNI",
] as const;
export type TicketTargetAudience = (typeof TICKET_TARGET_AUDIENCES)[number];

export type TicketAudience = "PUBLIC" | "MEMBERS" | "HONORARY" | TicketTargetAudience;

export const TICKET_AUDIENCES: readonly TicketAudience[] = [
  "PUBLIC",
  "MEMBERS",
  "HONORARY",
  ...TICKET_TARGET_AUDIENCES,
];

/**
 * Wat de shop van de ingelogde bezoeker moet weten om te beslissen welke
 * ticketsoorten er voor hem bestaan. Een uitgelogde bezoeker is
 * {@link NO_TICKET_PROFILE}.
 */
export type TicketViewerProfile = {
  honorary: boolean;
  audiences: readonly TicketTargetAudience[];
};

export const NO_TICKET_PROFILE: TicketViewerProfile = { honorary: false, audiences: [] };

export function isTargetAudience(audience: string): audience is TicketTargetAudience {
  return (TICKET_TARGET_AUDIENCES as readonly string[]).includes(audience);
}

/**
 * Alles wat we niet herkennen wordt `PUBLIC`: een onbekende waarde mag nooit
 * per ongeluk een strengere of net ruimere groep opleveren dan wat de
 * beheerder koos.
 */
export function ticketAudienceFrom(raw: unknown): TicketAudience {
  if (typeof raw === "string" && (TICKET_AUDIENCES as readonly string[]).includes(raw)) {
    return raw as TicketAudience;
  }
  return "PUBLIC";
}

/**
 * De doelgroepen van een account, zoals de ticketshop ze telt.
 *
 * Dezelfde afleiding als de kalender, met één verschil: **het studiejaar telt
 * enkel met een bevestiging van de lopende ronde.** In de kalender is een
 * verouderd profiel onschuldig (je ziet een eerstejaarsactiviteit te veel), bij
 * een ticket is het een goedkopere prijs voor wie vorig jaar eerstejaars was.
 * Internationaal en alumnus zijn geen jaarlijkse gegevens en tellen altijd.
 */
export function ticketAudiencesForProfile(
  user: {
    studyYears: readonly StudyYear[];
    internationalStudent: boolean;
    alumni: boolean;
    isStudent: boolean;
    studyConfirmedYear: number | null;
  },
  now: Date = new Date(),
): TicketTargetAudience[] {
  const confirmed =
    user.isStudent && (user.studyConfirmedYear ?? -1) >= studyConfirmationYear(now);
  return audiencesForStudyProfile(
    confirmed ? user.studyYears : [],
    user.internationalStudent,
    user.alumni,
  );
}

/**
 * Een ticketsoort die een account vereist. Dat is elke doelgroep behalve
 * "publiek" (wie je bent, weten we enkel van een account), maar ook **elk
 * gratis ticket**: zonder login is een gratis ticket niet aan
 * één persoon te binden en is de voorraad in een handomdraai leeg.
 */
export function ticketTypeRequiresLogin(type: {
  audience: string;
  priceCents: number;
}): boolean {
  return (
    type.audience === "MEMBERS" ||
    type.audience === "HONORARY" ||
    isTargetAudience(type.audience) ||
    type.priceCents === 0
  );
}

/**
 * Een ticketsoort voor leden, bij iemand die geen lid is.
 *
 * "Lid" is sinds het lidmaatschap meer dan "heeft een account": het is een
 * student van de faculteit Ingenieurswetenschappen (KU Leuven bevestigt dat) of
 * wie een lidmaatschap van dit academiejaar op zak heeft, gratis of betaald.
 * Zie `lib/membership`.
 *
 * Bewust **niet** verstoppen zoals een erelidticket: dit is een ticket dat je
 * kan krijgen, dus de shop toont het met de reden erbij en een weg naar het
 * lidmaatschap. Wie het toch meestuurt, wordt bij het afrekenen geweigerd.
 */
export function ticketTypeNeedsMembership(
  type: { audience: string },
  isMember: boolean,
): boolean {
  return type.audience === "MEMBERS" && !isMember;
}

/**
 * Een ticketsoort voor ereleden of voor een doelgroep bestaat voor iedereen
 * anders niet.
 *
 * Bewust wegfilteren en niet uitgrijzen: wat de kring aan haar ereleden geeft
 * (gratis naar een cantus, bijvoorbeeld) hoort geen zichtbare uitzondering te
 * zijn waar de rest van de site zich vragen bij stelt. Voor een doelgroep geldt
 * hetzelfde om een andere reden: een tweedejaars heeft niets aan een
 * uitgegrijsd eerstejaarsticket, en een event met vier doelgroepprijzen zou
 * anders vooral tonen wat je niet mag. Wie niet ingelogd is, krijgt wel een
 * hint (`audienceLoginHint` in `queries.ts`), want die kan er misschien wel
 * bij horen. `createOrder` weigert zo'n type ook serverside.
 */
export function ticketTypeIsHidden(
  type: { audience: string },
  viewer: TicketViewerProfile,
): boolean {
  if (type.audience === "HONORARY") return !viewer.honorary;
  if (isTargetAudience(type.audience)) return !viewer.audiences.includes(type.audience);
  return false;
}

/**
 * De ledenprijs van een ticketsoort, of null wanneer ze er geen heeft.
 *
 * Enkel bij doelgroep "publiek": een ledenprijs is een tweede prijs naast de
 * gewone, en een ticket dat al alleen voor leden (of ereleden) is, heeft geen
 * gewone prijs om naast te staan. Blijft er na een wijziging van de doelgroep
 * een oude waarde in de database staan, dan telt ze hier niet.
 */
export function ticketTypeMemberPrice(type: {
  audience: string;
  memberPriceCents?: number | null;
}): number | null {
  if (type.audience !== "PUBLIC") return null;
  return type.memberPriceCents ?? null;
}

const AUDIENCE_LABELS: Record<TicketAudience, { nl: string; en: string }> = {
  PUBLIC: { nl: "Leden en niet-leden", en: "Members and non-members" },
  MEMBERS: { nl: "Alleen leden", en: "Members only" },
  HONORARY: { nl: "Alleen ereleden", en: "Honorary members only" },
  FIRST_YEARS: { nl: "Alleen eerstejaars", en: "First-years only" },
  LAST_YEARS: { nl: "Alleen laatstejaars", en: "Final-years only" },
  INTERNATIONALS: { nl: "Alleen internationals", en: "Internationals only" },
  ALUMNI: { nl: "Alleen alumni", en: "Alumni only" },
};

/** De naam van een doelgroep zoals het beheer ze toont. */
export function ticketAudienceLabel(audience: string, locale: "nl" | "en"): string {
  return AUDIENCE_LABELS[ticketAudienceFrom(audience)][locale];
}

/** De doelgroep als zelfstandig naamwoord, voor de loginhint in de shop. */
export function ticketTargetAudienceNoun(audience: TicketTargetAudience, locale: "nl" | "en"): string {
  const nouns: Record<TicketTargetAudience, { nl: string; en: string }> = {
    FIRST_YEARS: { nl: "eerstejaars", en: "first-years" },
    LAST_YEARS: { nl: "laatstejaars", en: "final-year students" },
    INTERNATIONALS: { nl: "internationals", en: "internationals" },
    ALUMNI: { nl: "alumni", en: "alumni" },
  };
  return nouns[audience][locale];
}

/** Uitleg bij de keuze in het beheerformulier. */
export function ticketAudienceHelp(audience: TicketAudience, locale: "nl" | "en"): string {
  const nl = locale === "nl";
  switch (audience) {
    case "PUBLIC":
      return nl
        ? "Iedereen kan dit ticket kopen, ook zonder account."
        : "Anyone can buy this ticket, also without an account.";
    case "MEMBERS":
      return nl
        ? "Enkel leden van VTK zien dit ticket en kunnen het kopen: studenten van de faculteit en wie dit academiejaar lid is."
        : "Only VTK members see this ticket and can buy it: students of the faculty and anyone who is a member this academic year.";
    case "HONORARY":
      return nl
        ? "Enkel ereleden zien dit ticket; voor alle anderen bestaat het niet."
        : "Only honorary members see this ticket; for everyone else it does not exist.";
    case "FIRST_YEARS":
    case "LAST_YEARS":
      return nl
        ? `Enkel wie in zijn profiel ${audience === "FIRST_YEARS" ? "eerste bachelor" : "tweede master"} heeft staan én zijn studie dit jaar bevestigde, ziet dit ticket. Voor de rest bestaat het niet; wie niet ingelogd is, krijgt de hint om in te loggen.`
        : `Only accounts with ${audience === "FIRST_YEARS" ? "first bachelor" : "second master"} in their profile, confirmed for this year, see this ticket. For everyone else it does not exist; visitors who are not signed in get a hint to sign in.`;
    case "INTERNATIONALS":
      return nl
        ? "Enkel wie in zijn profiel aangaf internationale student te zijn, ziet dit ticket. Voor de rest bestaat het niet; wie niet ingelogd is, krijgt de hint om in te loggen."
        : "Only accounts marked as international student see this ticket. For everyone else it does not exist; visitors who are not signed in get a hint to sign in.";
    case "ALUMNI":
      return nl
        ? "Enkel wie in zijn profiel aangaf alumnus te zijn, ziet dit ticket. Voor de rest bestaat het niet; wie niet ingelogd is, krijgt de hint om in te loggen."
        : "Only accounts marked as alumni see this ticket. For everyone else it does not exist; visitors who are not signed in get a hint to sign in.";
  }
}

/**
 * De hint voor een uitgelogde bezoeker: "Eerstejaars of alumni?". Null wanneer
 * er geen doelgroepticket verborgen is.
 */
export function audienceLoginHintQuestion(
  audiences: readonly TicketTargetAudience[],
  locale: "nl" | "en",
): string | null {
  if (audiences.length === 0) return null;
  const nouns = TICKET_TARGET_AUDIENCES.filter((audience) => audiences.includes(audience)).map(
    (audience) => ticketTargetAudienceNoun(audience, locale),
  );
  const or = locale === "nl" ? " of " : " or ";
  const joined =
    nouns.length === 1 ? nouns[0] : `${nouns.slice(0, -1).join(", ")}${or}${nouns[nouns.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}?`;
}
