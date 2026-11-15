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

export const GROUP_KINDS = ["PRAESIDIUM", "WERKGROEP", "JAARWERKING"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export function isGroupKind(value: string | null | undefined): value is GroupKind {
  return (GROUP_KINDS as readonly string[]).includes(value ?? "");
}

/** Hoe een bron "elke groep van dit soort" heet, op het scherm en in het logboek. */
export function everyGroupOfKindLabel(kind: GroupKind, nl: boolean): string {
  if (kind === "PRAESIDIUM") return nl ? "Elke praesidiumpost" : "Every praesidium post";
  if (kind === "WERKGROEP") return nl ? "Elke werkgroep" : "Every work group";
  return nl ? "Elke jaarwerking" : "Every yearly event";
}

export type MailGroupSourceRow = {
  /** Precies één is ingevuld; zie het schema. */
  groupId?: string | null;
  /** Elke actieve groep van dit soort, bv. elke praesidiumpost. */
  groupType?: GroupKind | null;
  kiesploegId?: string | null;
  kiesploegPostId?: string | null;
  /** De vertegenwoordigers van een POC, van het jaar in `pocYears`. */
  pocId?: string | null;
  /** Enkel de verantwoordelijke van die post i.p.v. elk lid. */
  onlyLead: boolean;
};

export type MemberUser = {
  id: string;
  name: string;
  /** Het persoonlijke `@vtk.be`-account, of `null`. */
  googleEmail: string | null;
  /** Het adres waarmee het lid op de site staat; enkel gebruikt voor een POC. */
  siteEmail?: string | null;
  /** Actieve werkgroepaccounts, per werkgroep-id (statix.jan.peeters@vtk.be). */
  werkgroepEmails?: Record<string, string>;
};

/** Lidmaatschap van een post, werkgroep of jaarwerking. */
export type MembershipRow = {
  groupId: string;
  /** Nodig voor een bron die "elke praesidiumpost" zegt. */
  groupType: GroupKind;
  role: "MEMBER" | "LEAD";
  /** Werkingsjaar van dit lidmaatschap. */
  year: number;
  user: MemberUser;
};

/** Lidmaatschap van een kiesploeg. `postId` is leeg tot de postverdeling er is. */
export type KiesploegMembershipRow = {
  kiesploegId: string;
  postId: string | null;
  role: "MEMBER" | "LEAD";
  user: MemberUser;
};

/** Een vertegenwoordiger van een POC in een werkingsjaar. */
export type PocRepresentativeRow = {
  pocId: string;
  year: number;
  user: MemberUser;
};

/**
 * Een los lid: een vrij adres (ook een andere groep, zoals groep5@vtk.be), of een
 * lid van de site, waarvan het adres dan zijn gekoppelde account volgt.
 */
export type ExtraRow = {
  email?: string | null;
  user?: MemberUser | null;
  kind: "INCLUDE" | "EXCLUDE";
};

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

/**
 * Welk adres van een lid in een lijst komt.
 *
 * Een werkgroeplid kan twee accounts hebben: het persoonlijke en dat van de
 * werkgroep (statix.jan.peeters@vtk.be). In een lijst van die werkgroep hoort
 * het tweede; elders het eerste. Wie geen persoonlijk account heeft maar wel een
 * werkgroepaccount, krijgt dat laatste, anders viel hij stil uit een lijst als
 * werkgroepen@vtk.be.
 */
export function memberAddress(user: MemberUser, preferGroupId: string | null): string | null {
  const werkgroep = user.werkgroepEmails ?? {};
  const preferred = preferGroupId ? werkgroep[preferGroupId] : undefined;
  const address = preferred ?? user.googleEmail ?? Object.values(werkgroep).sort()[0] ?? null;
  return address ? normaliseEmail(address) : null;
}

export function desiredMembers(input: {
  sources: MailGroupSourceRow[];
  /**
   * Het werkingsjaar waarvoor de posten tellen: het huidige, of het vaste jaar
   * van een jaargroep (activiteiten_2627). Lidmaatschappen van een ander jaar
   * worden genegeerd.
   */
  year: number;
  /** Lidmaatschappen van actieve leden; mag meer jaren bevatten. */
  memberships: MembershipRow[];
  /** Kiesploeglidmaatschappen; leeg wanneer geen enkele bron een kiesploeg is. */
  kiesploegMemberships?: KiesploegMembershipRow[];
  /** POC-vertegenwoordigers; mag meer jaren bevatten. */
  pocRepresentatives?: PocRepresentativeRow[];
  /** Per POC het jaar waarvan de vertegenwoordigers in de lijst staan. */
  pocYears?: Record<string, number>;
  /** De werkgroep die de lijst beheert: haar leden krijgen hun werkgroepadres. */
  ownerGroupId?: string | null;
  /** Jaargroepen die als lid in deze lijst horen (activiteiten_2627@vtk.be). */
  childEmails?: string[];
  extras: ExtraRow[];
}): DesiredMembers {
  // Per bron onthouden of we iedereen of enkel de verantwoordelijke willen. Een
  // bron kan twee keer staan (één keer volledig, één keer enkel de
  // verantwoordelijke); dan wint de ruimste, anders zou de tweede rij de eerste
  // stiekem beperken.
  const empty = () => ({
    group: new Set<string>(),
    type: new Set<GroupKind>(),
    kiesploeg: new Set<string>(),
    post: new Set<string>(),
  });
  const wantAll = empty();
  const wantLead = empty();
  const pocs = new Set<string>();
  for (const source of input.sources) {
    const target = source.onlyLead ? wantLead : wantAll;
    if (source.groupId) target.group.add(source.groupId);
    if (source.groupType) target.type.add(source.groupType);
    if (source.kiesploegId) target.kiesploeg.add(source.kiesploegId);
    if (source.kiesploegPostId) target.post.add(source.kiesploegPostId);
    if (source.pocId) pocs.add(source.pocId);
  }

  const owner = input.ownerGroupId ?? null;
  const emails = new Set<string>();
  const unlinked = new Map<string, { id: string; name: string }>();
  // Wie langs één weg een adres kreeg, is niet "ongekoppeld" omdat een andere
  // weg (een andere bron) geen adres vond.
  const placed = new Set<string>();

  const take = (user: MemberUser, address: string | null) => {
    if (address) {
      emails.add(address);
      placed.add(user.id);
      unlinked.delete(user.id);
    } else if (!placed.has(user.id)) {
      unlinked.set(user.id, { id: user.id, name: user.name });
    }
  };

  for (const membership of input.memberships) {
    if (membership.year !== input.year) continue;
    const byGroup =
      wantAll.group.has(membership.groupId) ||
      (wantLead.group.has(membership.groupId) && membership.role === "LEAD");
    const byType =
      wantAll.type.has(membership.groupType) ||
      (wantLead.type.has(membership.groupType) && membership.role === "LEAD");
    if (byGroup) take(membership.user, memberAddress(membership.user, owner ?? membership.groupId));
    else if (byType) take(membership.user, memberAddress(membership.user, owner));
  }

  for (const membership of input.kiesploegMemberships ?? []) {
    const byKiesploeg =
      wantAll.kiesploeg.has(membership.kiesploegId) ||
      (wantLead.kiesploeg.has(membership.kiesploegId) && membership.role === "LEAD");
    const byPost =
      membership.postId !== null &&
      (wantAll.post.has(membership.postId) ||
        (wantLead.post.has(membership.postId) && membership.role === "LEAD"));
    if (byKiesploeg || byPost) take(membership.user, memberAddress(membership.user, owner));
  }

  for (const rep of input.pocRepresentatives ?? []) {
    if (!pocs.has(rep.pocId)) continue;
    if (rep.year !== (input.pocYears?.[rep.pocId] ?? input.year)) continue;
    // Een vertegenwoordiger is meestal een student zonder @vtk.be-account; dan
    // is het adres waarmee hij op de site staat het enige dat we hebben, en
    // ook het adres waarop hij de POC-mail verwacht.
    const address =
      memberAddress(rep.user, owner) ?? (rep.user.siteEmail ? normaliseEmail(rep.user.siteEmail) : null);
    take(rep.user, address);
  }

  for (const email of input.childEmails ?? []) {
    const address = normaliseEmail(email);
    if (address) emails.add(address);
  }

  for (const extra of input.extras) {
    if (extra.kind !== "INCLUDE") continue;
    if (extra.user) {
      take(extra.user, memberAddress(extra.user, owner));
      continue;
    }
    const email = extra.email ? normaliseEmail(extra.email) : "";
    if (email) emails.add(email);
  }

  // Uitsluitingen gaan als laatste, zodat ze zowel een afgeleid lid als een
  // handmatig toegevoegd adres tegenhouden. Anders zou de volgorde van de rijen
  // bepalen wat er gebeurt.
  for (const extra of input.extras) {
    if (extra.kind !== "EXCLUDE") continue;
    if (extra.user) {
      unlinked.delete(extra.user.id);
      for (const address of [
        extra.user.googleEmail,
        ...Object.values(extra.user.werkgroepEmails ?? {}),
        extra.user.siteEmail,
      ]) {
        if (address) emails.delete(normaliseEmail(address));
      }
      continue;
    }
    if (extra.email) emails.delete(normaliseEmail(extra.email));
  }

  return {
    emails: [...emails].sort(),
    unlinked: [...unlinked.values()].sort((a, b) => a.name.localeCompare(b.name, "nl")),
  };
}
