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
 * De regel raakt enkel het **event**venster. Een tickettype met een eigen
 * verkoopstart houdt die: zo'n venster is een aparte beslissing van de
 * beheerder ("late tickets vanaf 5 december"), en een voorverkoop hoort die
 * niet stiekem naar voren te halen. Wie in de voorverkoop mag, krijgt dus
 * `max(voorverkoopstart, eigen start van het type)`.
 */

export type PresaleConfig = {
  presaleLeadMinutes?: number | null;
  presalePraesidium?: boolean;
  presaleGroups?: readonly { groupId: string }[];
};

/** Enkel wat de regel nodig heeft, zodat ze zonder sessie te bouwen testbaar is. */
export type PresaleViewer = {
  groups: readonly { id: string; type: string }[];
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
 * Mag deze bezoeker in de voorverkoop? Standaard elke praesidiumpost, plus de
 * groepen die de beheerder er expliciet bij zette.
 *
 * Een uitgelogde bezoeker nooit: de voorverkoop hangt aan een lidmaatschap, en
 * dat kennen we enkel van een sessie.
 */
export function inPresaleAudience(viewer: PresaleViewer, event: PresaleConfig): boolean {
  if (!viewer) return false;
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
