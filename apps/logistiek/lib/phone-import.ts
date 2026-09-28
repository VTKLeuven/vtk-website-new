/**
 * Wat de gedeelde gsm-lijst voorstelt, naast wat er al staat (F4.3).
 *
 * De derde stap van de import. `vcard.ts` leest het bestand en koppelt op naam;
 * dit bepaalt wat er met elke koppeling gebeurt, en dus welk vinkje aan staat
 * wanneer het scherm opengaat.
 *
 * **Pure functies en geen databank**, om dezelfde reden als in `vcard.ts`: dit
 * is de beslissing die stil fout kan gaan. Eén vinkje te veel aan en een nummer
 * dat het team zelf bevestigde, is weg; eén te weinig en de import doet niets
 * terwijl het scherm zegt van wel. Geen van beide zie je aan het resultaat.
 */
import type { DriverPhoneSource } from './driver-phones';
import type { Match, Person } from './vcard';

/** Een chauffeur zoals het importscherm hem kent: zijn nummer en waar het vandaan komt. */
export type PhoneHolder = Person & {
  phone: string | null;
  phoneSource: DriverPhoneSource | null;
};

/**
 * Het nummer dat het team zelf vastlegde, of `null`.
 *
 * Enkel de bron `TEAM` telt als bevestigd. Een nummer van iemands profiel of uit
 * een oude aanvraag is een gok die toevallig klopte; daar mag de lijst wél
 * overheen, en dat is precies waar deze import voor dient.
 */
export function teamPhone(driver: PhoneHolder): string | null {
  return driver.phoneSource === 'TEAM' ? driver.phone : null;
}

export type PhonePlan<T extends PhoneHolder> = {
  /** Nog geen nummer van het team: standaard aangevinkt. */
  fresh: Array<Match<T>>;
  /** Het team zette hier zelf een ander nummer: standaard uit. */
  different: Array<Match<T>>;
  /** Precies hetzelfde nummer: er valt niets te doen, en er hoort dus geen vinkje. */
  same: Array<Match<T>>;
};

/** De koppelingen verdelen over de drie gevallen. */
export function planPhoneImport<T extends PhoneHolder>(matches: ReadonlyArray<Match<T>>): PhonePlan<T> {
  const plan: PhonePlan<T> = { fresh: [], different: [], same: [] };
  for (const match of matches) {
    const current = teamPhone(match.person);
    if (current === null) plan.fresh.push(match);
    else if (current === match.phone) plan.same.push(match);
    else plan.different.push(match);
  }
  return plan;
}
