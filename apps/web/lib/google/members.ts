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
  /** Precies één van de drie is ingevuld; zie het schema. */
  groupId?: string | null;
  kiesploegId?: string | null;
  kiesploegPostId?: string | null;
  /** Enkel de verantwoordelijke van die post i.p.v. elk lid. */
  onlyLead: boolean;
};

export type MemberUser = { id: string; name: string; googleEmail: string | null };

/** Lidmaatschap van een post of werkgroep, huidig werkingsjaar. */
export type MembershipRow = {
  groupId: string;
  role: "MEMBER" | "LEAD";
  user: MemberUser;
};

/** Lidmaatschap van een kiesploeg. `postId` is leeg tot de postverdeling er is. */
export type KiesploegMembershipRow = {
  kiesploegId: string;
  postId: string | null;
  role: "MEMBER" | "LEAD";
  user: MemberUser;
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
  /** Kiesploeglidmaatschappen; leeg wanneer geen enkele bron een kiesploeg is. */
  kiesploegMemberships?: KiesploegMembershipRow[];
  extras: ExtraRow[];
}): DesiredMembers {
  // Per bron onthouden of we iedereen of enkel de verantwoordelijke willen. Een
  // bron kan twee keer staan (één keer volledig, één keer enkel de
  // verantwoordelijke); dan wint de ruimste, anders zou de tweede rij de eerste
  // stiekem beperken.
  const wantAll = { group: new Set<string>(), kiesploeg: new Set<string>(), post: new Set<string>() };
  const wantLead = { group: new Set<string>(), kiesploeg: new Set<string>(), post: new Set<string>() };
  for (const source of input.sources) {
    const target = source.onlyLead ? wantLead : wantAll;
    if (source.groupId) target.group.add(source.groupId);
    if (source.kiesploegId) target.kiesploeg.add(source.kiesploegId);
    if (source.kiesploegPostId) target.post.add(source.kiesploegPostId);
  }

  const emails = new Set<string>();
  const unlinked = new Map<string, { id: string; name: string }>();

  const take = (user: MemberUser) => {
    const email = user.googleEmail ? normaliseEmail(user.googleEmail) : "";
    if (email) emails.add(email);
    else unlinked.set(user.id, { id: user.id, name: user.name });
  };

  for (const membership of input.memberships) {
    const included =
      wantAll.group.has(membership.groupId) ||
      (wantLead.group.has(membership.groupId) && membership.role === "LEAD");
    if (included) take(membership.user);
  }

  for (const membership of input.kiesploegMemberships ?? []) {
    const byKiesploeg =
      wantAll.kiesploeg.has(membership.kiesploegId) ||
      (wantLead.kiesploeg.has(membership.kiesploegId) && membership.role === "LEAD");
    const byPost =
      membership.postId !== null &&
      (wantAll.post.has(membership.postId) ||
        (wantLead.post.has(membership.postId) && membership.role === "LEAD"));
    if (byKiesploeg || byPost) take(membership.user);
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
