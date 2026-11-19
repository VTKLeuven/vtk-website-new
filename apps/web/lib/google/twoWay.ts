/**
 * Tweerichtingsverkeer tussen een groep in Google en haar regel op de site.
 *
 * Tot 17 november 2026 was de site de enige bron: wie in de Admin console een
 * lid toevoegde, zag het binnen de vijf minuten weer verdwijnen ("die bot
 * reverteert al mijn changes"). Nu onthoudt de site na elke ronde wie ze in
 * Google zette (`MailGroup.syncedMembers`), en leest ze een verschil met wat er
 * nu in Google staat als een wijziging van een mens in Google:
 *
 * - **in Google toegevoegd**: wordt een los lid op de site, en blijft staan;
 * - **in Google verwijderd**: een los lid verdwijnt ook op de site; wie er via
 *   een bron (een post) in zat, krijgt een uitsluiting;
 * - wat op de site veranderde, gaat zoals altijd naar Google.
 *
 * Zonder onthouden lijst (de eerste ronde, of een groep die net aangemaakt is)
 * weet de site niet wat er in Google verwijderd werd: dan neemt ze wat extra in
 * Google staat over, en haalt ze niemand weg. Liever een lid te veel dan een
 * lid dat stil verdwijnt.
 *
 * Geen `server-only`: puur, zie `test/googleTwoWay.test.ts`. Enkel gewone leden;
 * eigenaars en beheerders raakt de sync nooit aan.
 */

export type TwoWayInput = {
  /** Wat de regel op de site nu oplevert. */
  desired: string[];
  /** Gewone leden die nu in Google staan. */
  remote: string[];
  /** Wie de site na de vorige ronde in Google zette; `null` als dat niet bekend is. */
  baseline: string[] | null;
};

export type TwoWayPlan = {
  /** In Google toegevoegd: als los lid overnemen. */
  takeOver: string[];
  /** In Google verwijderd terwijl de site ze nog wil: uit de regel halen. */
  dropped: string[];
  /** Naar Google: erbij. */
  add: string[];
  /** Naar Google: eruit (de site haalde ze weg). */
  remove: string[];
  /** Wie er na deze ronde in Google staat: de nieuwe onthouden lijst. */
  next: string[];
};

export function planTwoWay({ desired, remote, baseline }: TwoWayInput): TwoWayPlan {
  const want = new Set(desired);
  const now = new Set(remote);
  const before = baseline ? new Set(baseline) : null;

  // Een verschil met de vorige ronde is een mens in Google.
  const addedInGoogle = remote.filter((e) => (before ? !before.has(e) : !want.has(e)));
  const removedInGoogle = before ? [...before].filter((e) => !now.has(e)) : [];

  const takeOver = addedInGoogle.filter((e) => !want.has(e));
  const dropped = removedInGoogle.filter((e) => want.has(e));

  const result = new Set(desired);
  for (const e of takeOver) result.add(e);
  for (const e of dropped) result.delete(e);

  const add = [...result].filter((e) => !now.has(e));
  const remove = remote.filter((e) => !result.has(e));
  return {
    takeOver: sorted(takeOver),
    dropped: sorted(dropped),
    add: sorted(add),
    remove: sorted(remove),
    next: sorted([...result]),
  };
}

function sorted(list: string[]): string[] {
  return [...new Set(list)].sort();
}
