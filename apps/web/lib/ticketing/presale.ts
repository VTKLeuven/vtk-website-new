/**
 * Wie mag er voor de rest kopen, en vanaf wanneer?
 *
 * Een voorverkoop is een duur voor `salesStartAt`, geen tweede datum. De kring
 * verzet een verkoopstart vaker dan ze een voorverkoop wil verzetten, en twee
 * datums die uit de pas lopen leveren een event op dat voor niemand klopt.
 *
 * Bewust een los, puur bestand, net als `audience.ts`: dezelfde regel wordt op
 * drie plaatsen gelezen (de lijst en de pagina in `queries.ts`, en het slot bij
 * het afrekenen in `orders.ts`), en ze hoort daar niet drie keer in een eigen
 * vorm te staan.
 *
 * Een tickettype met een **latere** eigen verkoopstart houdt die: zo'n venster
 * is een aparte beslissing van de beheerder ("late tickets vanaf 5 december"),
 * en een voorverkoop hoort die niet stiekem naar voren te halen.
 *
 * Een eigen start die op of vóór de publieke verkoopstart valt, is dat niet.
 * Die zegt niets bovenop het eventvenster (dat sluit toch al af), en in de
 * praktijk staat ze er omdat het beheerformulier ze mee overneemt van het
 * event. Liet de voorverkoop ook die staan, dan kreeg wie in voorverkoop mag
 * wel de melding "jij kan nu al bestellen" te zien, maar stond élk tickettype
 * op "Binnenkort" en viel er niets te kopen. Vandaar
 * {@link viewerTypeSalesStart}.
 */

/**
 * Vanaf hoeveel shiften in het lopende werkingsjaar je als vaste medewerker
 * meetelt. Eén getal, hier, zodat de shop, het slot bij het afrekenen en de
 * uitleg in de admin niet elk hun eigen drempel hebben.
 */
export const PRESALE_SHIFT_THRESHOLD = 15;

export type PresaleConfig = {
  presaleLeadMinutes?: number | null;
  presalePraesidium?: boolean;
  presaleHelpers?: boolean;
  presaleGroups?: readonly { groupId: string }[];
};

/** Enkel wat de regel nodig heeft, zodat ze zonder sessie te bouwen testbaar is. */
export type PresaleViewer = {
  groups: readonly { id: string; type: string }[];
  /** Voltooide shiften in het lopende werkingsjaar; zie `presaleViewer.ts`. */
  completedShifts?: number;
  /**
   * Volgde de private voorverkooplink van dit event (zie `presaleLink.ts`).
   * Bewust per event bepaald en niet een lijst tokens hier: de regel hoeft geen
   * geheim te kennen, enkel het antwoord.
   */
  hasPresaleLink?: boolean;
} | null | undefined;

/** Heeft dit event een voorverkoop die ergens op slaat? */
export function hasPresale(
  event: PresaleConfig & { salesStartAt?: Date | string | null }
): boolean {
  return Boolean(event.salesStartAt) && (event.presaleLeadMinutes ?? 0) > 0;
}

/**
 * Het moment waarop de voorverkoop begint, of `null` wanneer er geen is.
 *
 * Geen `salesStartAt` betekent dat de verkoop al voor iedereen open staat; dan
 * valt er niets vroeger open te zetten.
 */
export function presaleStart(
  event: PresaleConfig & { salesStartAt?: Date | string | null }
): Date | null {
  if (!hasPresale(event)) return null;
  const start = new Date(event.salesStartAt!);
  return new Date(start.getTime() - (event.presaleLeadMinutes ?? 0) * 60_000);
}

/**
 * Mag deze bezoeker in de voorverkoop? Standaard elke praesidiumpost én elke
 * vaste medewerker, plus de groepen die de beheerder er expliciet bij zette.
 *
 * Die vaste medewerker staat er bewust bij. Wie dit werkingsjaar vijftien
 * shiften deed, staat even vaak achter de toog als een praesidiumlid, maar zit
 * in geen enkele post; zonder deze tak is de voorverkoop van "wie meewerkt"
 * stilzwijgend "wie een postje heeft". De drempel telt enkel dit werkingsjaar,
 * zoals alle rechten: ze reset mee op 15 juli.
 *
 * Een uitgelogde bezoeker komt er enkel in met de private link: al de rest
 * hangt aan wie je bent, en dat kennen we enkel van een sessie.
 */
export function inPresaleAudience(viewer: PresaleViewer, event: PresaleConfig): boolean {
  if (!viewer) return false;
  // De private link is zelf het bewijs: wie hem volgde, hoort erbij, ook zonder
  // post en zonder shiften.
  if (viewer.hasPresaleLink) return true;
  if (
    event.presaleHelpers !== false &&
    (viewer.completedShifts ?? 0) >= PRESALE_SHIFT_THRESHOLD
  ) {
    return true;
  }
  const extra = new Set((event.presaleGroups ?? []).map((group) => group.groupId));
  return viewer.groups.some(
    (group) =>
      (event.presalePraesidium !== false && group.type === "PRAESIDIUM") || extra.has(group.id)
  );
}

/**
 * De verkoopstart zoals **deze** bezoeker ze ervaart.
 *
 * Alles wat verder met een venster werkt (de shop, de lijst, het slot bij het
 * afrekenen) rekent hiermee en hoeft de voorverkoop zelf niet te kennen.
 */
export function viewerSalesStart(
  event: PresaleConfig & { salesStartAt?: Date | string | null },
  viewer: PresaleViewer
): Date | null {
  const start = event.salesStartAt ? new Date(event.salesStartAt) : null;
  if (!hasPresale(event) || !inPresaleAudience(viewer, event)) return start;
  return presaleStart(event);
}

/**
 * De verkoopstart van één **tickettype** zoals deze bezoeker ze ervaart.
 *
 * Enkel een eigen start die later valt dan de publieke verkoopstart is een
 * echte, aparte beslissing van de beheerder; die blijft staan, ook in
 * voorverkoop. Al de rest volgt het eventvenster, en dus de voorverkoop.
 *
 * Voor wie niet in de voorverkoop zit verandert dit niets: `viewerSalesStart`
 * geeft dan gewoon de publieke start terug, en een eigen start die daarvóór
 * ligt werd toch al door dat eventvenster tegengehouden.
 */
export function viewerTypeSalesStart(
  event: PresaleConfig & { salesStartAt?: Date | string | null },
  type: { salesStartAt?: Date | string | null },
  viewer: PresaleViewer
): Date | null {
  const eventStart = viewerSalesStart(event, viewer);
  if (!type.salesStartAt) return eventStart;

  const typeStart = new Date(type.salesStartAt);
  const publicStart = event.salesStartAt ? new Date(event.salesStartAt) : null;
  if (publicStart && typeStart <= publicStart) return eventStart;
  return typeStart;
}

/** Koopt deze bezoeker nu in voorverkoop? Enkel om het hem te kunnen zeggen. */
export function isInPresaleNow(
  event: PresaleConfig & { salesStartAt?: Date | string | null },
  viewer: PresaleViewer,
  now: Date = new Date()
): boolean {
  if (!hasPresale(event) || !inPresaleAudience(viewer, event)) return false;
  const publicStart = new Date(event.salesStartAt!);
  const start = presaleStart(event)!;
  return start <= now && now < publicStart;
}
