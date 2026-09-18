/**
 * Welk nummer een chauffeur krijgt wanneer er meerdere bestaan.
 *
 * Los van de databank, want dit is de eigenlijke beslissing: welke bron wint,
 * en wat zeg je daarover op het scherm. `driverPhones` in lib/uitleen-server.ts
 * haalt de rijen op en geeft ze hier binnen.
 */

/** Waar het nummer van een chauffeur vandaan komt. */
export type DriverPhoneSource = 'TEAM' | 'PROFILE' | 'HISTORY';

export type DriverPhone = { number: string; source: DriverPhoneSource };

/** Een nummer dat iemand zelf bij een eigen aanvraag opgaf. */
export type PhoneFromHistory = { userId: string; phone: string | null; createdAt: Date };

/**
 * De drie bronnen samenleggen tot één nummer per persoon.
 *
 * De volgorde is die van betrouwbaarheid:
 *
 * 1. `TEAM` : wat Logistiek zelf invulde bij Chauffeurs (`UitleenDriver.phone`).
 *    Een bevestigd nummer, en dat gaat voor op alles.
 * 2. `PROFILE` : het gsm-nummer op het account (`User.phone`), ingevuld door het
 *    lid zelf. Het klopt dus per definitie voor die persoon, maar niemand van
 *    Logistiek heeft het nagekeken.
 * 3. `HISTORY` : het laatste contactnummer uit een eigen aanvraag. Het laatste
 *    redmiddel, want het kan het nummer van toen zijn en niet van vandaag.
 *
 * De bron reist mee omdat het beheerscherm het verschil moet kunnen zeggen:
 * "dit gaf hij ooit ergens op" is iets anders dan "dit staat vast".
 */
export function resolveDriverPhones(sources: {
  team: Array<{ userId: string; phone: string | null }>;
  profile: Array<{ userId: string; phone: string | null }>;
  history: PhoneFromHistory[];
}): Map<string, DriverPhone> {
  const phones = new Map<string, DriverPhone>();

  // Van zwak naar sterk: elke volgende bron schrijft over de vorige heen, zodat
  // de sterkste die iets heeft, wint. Binnen de historiek gebeurt dat net niet,
  // want daar zou elke oudere rij de nieuwere overschrijven; die stopt daarom
  // bij de eerste, en dus de meest recente, per persoon.
  for (const row of [...sources.history].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )) {
    const phone = row.phone?.trim();
    if (phone && !phones.has(row.userId)) phones.set(row.userId, { number: phone, source: 'HISTORY' });
  }
  for (const row of sources.profile) {
    const phone = row.phone?.trim();
    if (phone) phones.set(row.userId, { number: phone, source: 'PROFILE' });
  }
  for (const row of sources.team) {
    const phone = row.phone?.trim();
    if (phone) phones.set(row.userId, { number: phone, source: 'TEAM' });
  }

  return phones;
}
