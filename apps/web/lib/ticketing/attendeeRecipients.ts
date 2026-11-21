import type { AttendeeGroup } from "./attendeeGroups";

/**
 * Wie een bericht aan de deelnemers krijgt (tabblad Deelnemers, "Deelnemers
 * mailen"). Bewust zonder prisma, zodat de keuze zonder database te testen is
 * en het formulier in de browser met dezelfde regel kan tellen.
 *
 * - **Enkel geldige tickets.** Wie verwijderd of terugbetaald werd, komt niet
 *   meer naar het event en hoort het bericht niet te krijgen.
 * - **Het adres van de deelnemer**, en zonder eigen adres dat van de koper,
 *   zoals de deelnemerslijst het toont.
 * - **Eén mail per adres**, ook wie vier tickets heeft of voor vier vrienden
 *   kocht: vier keer hetzelfde bericht is spam.
 * - **Tickettypes en groepen zijn filters die samen gelden**: "Bierticket" en
 *   "lid" is wie een bierticket heeft én lid is. Leeg betekent: alle.
 */
export type RecipientCandidate = {
  /** Adres in kleine letters: de deelnemer, of de koper bij een ticket zonder adres. */
  email: string;
  name: string;
  ticketTypeId: string;
  group: AttendeeGroup;
  orderId: string;
};

export type RecipientFilter = {
  ticketTypeIds: readonly string[];
  groups: readonly AttendeeGroup[];
};

export type Recipient = { email: string; name: string; orderId: string };

export function pickRecipients(
  candidates: readonly RecipientCandidate[],
  filter: RecipientFilter,
): Recipient[] {
  const types = new Set(filter.ticketTypeIds);
  const groups = new Set(filter.groups);
  const byEmail = new Map<string, Recipient>();
  for (const candidate of candidates) {
    if (types.size > 0 && !types.has(candidate.ticketTypeId)) continue;
    if (groups.size > 0 && !groups.has(candidate.group)) continue;
    const email = candidate.email.trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, { email, name: candidate.name, orderId: candidate.orderId });
  }
  return [...byEmail.values()];
}
