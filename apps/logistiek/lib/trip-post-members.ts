/**
 * Puur en zonder `'use client'`: de servercomponenten (de lijst in het beheer,
 * "Mijn ritten") bouwen dit op, en een functie uit een clientmodule kan je op de
 * server niet aanroepen.
 */

/**
 * De leden van de post van de rit, voor een rit zonder bijrijder.
 *
 * Wie er de dag zelf meegaat, is vaak iemand anders van dezelfde post dan de
 * aanvrager. Staat er (nog) geen bijrijder, dan toont het blok wie de chauffeur
 * en Logistiek wel kunnen bellen, op dezelfde manier als een bijrijder. Komt van
 * `postMembersWithPhones`, al in de volgorde waarin het getoond wordt; enkel
 * meegeven waar de kijker de nummers van die post mag zien. Zonder de aanvrager
 * (`withoutRequester`): die staat al als contactpersoon bij de rit, en dezelfde
 * persoon twee keer onder elkaar leest als twee mensen.
 */
export type TripPostMembers = {
  groupName: string;
  members: Array<{ id: string; name: string; phone: string | null }>;
};

/** De leden van de post, zonder de aanvrager; `null` wanneer er niemand overblijft. */
export function withoutRequester(
  groupName: string,
  members: TripPostMembers['members'] | undefined,
  requesterId: string
): TripPostMembers | null {
  const rest = (members ?? []).filter((member) => member.id !== requesterId);
  return rest.length > 0 ? { groupName, members: rest } : null;
}
