/**
 * Wie mag een ticketsoort zien en kopen?
 *
 * Bewust een los, puur bestand: dezelfde regel wordt op drie plaatsen gelezen
 * (de publieke shop in `queries.ts`, het slot bij het afrekenen in `orders.ts`
 * en het beheerformulier), en ze stond er tot nu toe twee keer in een eigen
 * vorm. Zo groeien ze niet uit elkaar en zijn ze zonder database te testen.
 */

export type TicketAudience = "PUBLIC" | "MEMBERS" | "HONORARY";

/**
 * Alles wat we niet herkennen wordt `PUBLIC`: een onbekende waarde mag nooit
 * per ongeluk een strengere of net ruimere groep opleveren dan wat de
 * beheerder koos.
 */
export function ticketAudienceFrom(raw: unknown): TicketAudience {
  if (raw === "MEMBERS") return "MEMBERS";
  if (raw === "HONORARY") return "HONORARY";
  return "PUBLIC";
}

/**
 * Een ticketsoort die een account vereist. Dat is de doelgroep "alleen leden",
 * maar ook **elk gratis ticket**: zonder login is een gratis ticket niet aan
 * één persoon te binden en is de voorraad in een handomdraai leeg.
 */
export function ticketTypeRequiresLogin(type: {
  audience: string;
  priceCents: number;
}): boolean {
  return type.audience === "MEMBERS" || type.priceCents === 0;
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
 * Een ticketsoort voor ereleden bestaat voor iedereen anders niet.
 *
 * Bewust wegfilteren en niet uitgrijzen: wat de kring aan haar ereleden geeft
 * (gratis naar een cantus, bijvoorbeeld) hoort geen zichtbare uitzondering te
 * zijn waar de rest van de site zich vragen bij stelt. Wie geen erelid is, ziet
 * gewoon het gewone aanbod, en `createOrder` weigert zo'n type ook serverside.
 */
export function ticketTypeIsHidden(type: { audience: string }, isHonorary: boolean): boolean {
  return type.audience === "HONORARY" && !isHonorary;
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
