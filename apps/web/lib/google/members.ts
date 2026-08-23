/**
 * Wie er in een groepsadres hoort.
 *
 * Bewust een pure functie zonder database of Google erin: dit is de regel waar
 * de hele koppeling op draait, en ze hoort testbaar te zijn zonder een van
 * beide (zie `test/mailGroupMembers.test.ts`). `lib/google/sync.ts` haalt de
 * rijen op en voert het resultaat uit.
 *
 * Geen `server-only`: deze module raakt niets aan wat serverbelast is.
 */

export type MailGroupSourceRow = {
  groupId: string;
  /** Enkel de verantwoordelijke van die post i.p.v. elk lid. */
  onlyLead: boolean;
};

export type MembershipRow = {
  groupId: string;
  role: "MEMBER" | "LEAD";
  user: { id: string; name: string; googleEmail: string | null };
};

export type ExtraRow = { email: string; kind: "INCLUDE" | "EXCLUDE" };

export type DesiredMembers = {
  /** De adressen die in Google horen te staan: klein, uniek en gesorteerd. */
  emails: string[];
  /**
   * Leden die volgens de posten in de lijst horen maar nog geen gekoppeld
   * `@vtk.be`-adres hebben. Die worden niet stil overgeslagen: het beheerscherm
   * toont ze, zodat iemand ze kan koppelen of bewust hun privéadres toevoegt.
   */
  unlinked: { id: string; name: string }[];
};

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function desiredMembers(input: {
  sources: MailGroupSourceRow[];
  /** Lidmaatschappen van het huidige werkingsjaar, van actieve leden. */
  memberships: MembershipRow[];
  extras: ExtraRow[];
}): DesiredMembers {
  // Per post onthouden of we iedereen of enkel de verantwoordelijke willen. Een
  // post kan twee keer als bron staan (één keer volledig, één keer enkel de
  // verantwoordelijke); dan wint de ruimste, anders zou de tweede rij de eerste
  // stiekem beperken.
  const wantAll = new Set<string>();
  const wantLead = new Set<string>();
  for (const source of input.sources) {
    if (source.onlyLead) wantLead.add(source.groupId);
    else wantAll.add(source.groupId);
  }

  const emails = new Set<string>();
  const unlinked = new Map<string, { id: string; name: string }>();

  for (const membership of input.memberships) {
    const included =
      wantAll.has(membership.groupId) ||
      (wantLead.has(membership.groupId) && membership.role === "LEAD");
    if (!included) continue;

    const email = membership.user.googleEmail ? normaliseEmail(membership.user.googleEmail) : "";
    if (email) emails.add(email);
    else unlinked.set(membership.user.id, { id: membership.user.id, name: membership.user.name });
  }

  for (const extra of input.extras) {
    if (extra.kind !== "INCLUDE") continue;
    const email = normaliseEmail(extra.email);
    if (email) emails.add(email);
  }

  // Uitsluitingen gaan als laatste, zodat ze zowel een afgeleid lid als een
  // handmatig toegevoegd adres tegenhouden. Anders zou de volgorde van de rijen
  // bepalen wat er gebeurt.
  for (const extra of input.extras) {
    if (extra.kind !== "EXCLUDE") continue;
    emails.delete(normaliseEmail(extra.email));
  }

  return {
    emails: [...emails].sort(),
    unlinked: [...unlinked.values()].sort((a, b) => a.name.localeCompare(b.name, "nl")),
  };
}
