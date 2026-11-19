import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import {
  type DesiredMembers,
  type GroupKind,
  type KiesploegMembershipRow,
  type MemberUser,
  type MembershipRow,
  type PocRepresentativeRow,
  desiredMembers,
} from "./members";

/**
 * De rijen ophalen die {@link desiredMembers} nodig heeft, voor de sync én voor
 * de beheerschermen.
 *
 * Eén plek, zodat wat het scherm als "leden" toont precies is wat de sync
 * straks in Google zet. Die twee liepen vroeger elk met een eigen query, en
 * dat is het soort drift dat je pas merkt wanneer iemand vraagt waarom hij wel
 * op het scherm staat maar geen mail krijgt.
 */

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  googleEmail: true,
  werkgroepAccounts: {
    where: { status: "ACTIVE" as const },
    select: { groupId: true, email: true },
  },
} as const;

type UserRow = {
  id: string;
  name: string;
  email: string;
  googleEmail: string | null;
  werkgroepAccounts: { groupId: string; email: string }[];
};

function toMemberUser(user: UserRow): MemberUser {
  return {
    id: user.id,
    name: user.name,
    googleEmail: user.googleEmail,
    siteEmail: user.email,
    werkgroepEmails: Object.fromEntries(user.werkgroepAccounts.map((a) => [a.groupId, a.email])),
  };
}

/** Wat elke lijst meebrengt voor de berekening. */
export const MAIL_GROUP_SELECT = {
  id: true,
  email: true,
  name: true,
  description: true,
  googleId: true,
  enabled: true,
  allowExternalSenders: true,
  ownerGroupId: true,
  year: true,
  parentId: true,
  yearlyTemplate: true,
  yearlyGroupId: true,
  sources: {
    select: {
      groupId: true,
      groupType: true,
      kiesploegId: true,
      kiesploegPostId: true,
      pocId: true,
      onlyLead: true,
    },
  },
  extras: {
    select: { email: true, kind: true, user: { select: USER_SELECT } },
  },
  children: { select: { email: true, year: true, enabled: true } },
} as const;

export type MailGroupForSync = {
  id: string;
  email: string;
  name: string;
  description: string | null;
  googleId: string | null;
  enabled: boolean;
  allowExternalSenders: boolean;
  ownerGroupId: string | null;
  year: number | null;
  parentId: string | null;
  yearlyTemplate: string | null;
  yearlyGroupId: string | null;
  sources: {
    groupId: string | null;
    groupType: GroupKind | null;
    kiesploegId: string | null;
    kiesploegPostId: string | null;
    pocId: string | null;
    onlyLead: boolean;
  }[];
  extras: { email: string | null; kind: "INCLUDE" | "EXCLUDE"; user: UserRow | null }[];
  children: { email: string; year: number | null; enabled: boolean }[];
};

export type DesiredContext = {
  /** Het huidige werkingsjaar, één keer vastgelegd voor de hele ronde. */
  year: number;
  memberships: MembershipRow[];
  kiesploeg: KiesploegMembershipRow[];
  pocRepresentatives: PocRepresentativeRow[];
  pocYears: Record<string, number>;
};

/**
 * Een jaargroep van een voorbij werkingsjaar is het archief van die ploeg: we
 * zetten er niemand meer in en halen er niemand meer uit. Zou de sync haar
 * blijven volgen, dan liep ze op 15 juli leeg omdat de site van oude jaren
 * minder bijhoudt dan Google.
 */
export function isArchivedYear(row: { year: number | null }, year: number): boolean {
  return row.year !== null && row.year < year;
}

function isId(value: string | null): value is string {
  return value !== null;
}

/** Alle lidmaatschappen die de opgegeven lijsten samen nodig hebben, in vier queries. */
export async function loadDesiredContext(
  rows: MailGroupForSync[],
  year: number = currentWorkingYear(),
): Promise<DesiredContext> {
  const sources = rows.flatMap((r) => r.sources);
  const groupIds = [...new Set(sources.map((s) => s.groupId).filter(isId))];
  // "Elke praesidiumpost" en "elke werkgroep": dan hangt de lijst niet aan
  // vijftien id's die je moet aanvullen zodra er een post bijkomt.
  const groupTypes = [
    ...new Set(sources.map((s) => s.groupType).filter((t): t is GroupKind => t !== null)),
  ];
  const kiesploegIds = [...new Set(sources.map((s) => s.kiesploegId).filter(isId))];
  const postIds = [...new Set(sources.map((s) => s.kiesploegPostId).filter(isId))];
  const pocIds = [...new Set(sources.map((s) => s.pocId).filter(isId))];
  // Een jaargroep telt de posten van haar eigen jaar.
  const years = [...new Set(rows.map((r) => r.year ?? year))];

  const [posts, kiesploeg, pocs] = await Promise.all([
    groupIds.length === 0 && groupTypes.length === 0
      ? []
      : prisma.groupMembership.findMany({
          where: {
            year: { in: years },
            OR: [
              ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
              ...(groupTypes.length
                ? [{ group: { type: { in: groupTypes }, active: true } }]
                : []),
            ],
            // Een gedeactiveerd of gewist account hoort in geen enkele lijst
            // meer, ook niet wanneer het lidmaatschap van dit jaar nog bestaat.
            user: { active: true, deletedAt: null },
          },
          select: {
            groupId: true,
            role: true,
            year: true,
            group: { select: { type: true } },
            user: { select: USER_SELECT },
          },
        }),
    kiesploegIds.length === 0 && postIds.length === 0
      ? []
      : prisma.kiesploegMember.findMany({
          where: {
            OR: [{ kiesploegId: { in: kiesploegIds } }, { postId: { in: postIds } }],
            user: { active: true, deletedAt: null },
          },
          select: {
            kiesploegId: true,
            postId: true,
            role: true,
            user: { select: USER_SELECT },
          },
        }),
    pocIds.length === 0
      ? []
      : prisma.poc.findMany({
          where: { id: { in: pocIds } },
          select: { id: true, mailYear: true },
        }),
  ]);

  const pocYears = Object.fromEntries(pocs.map((p) => [p.id, p.mailYear ?? year]));
  const reps =
    pocIds.length === 0
      ? []
      : await prisma.pocRepresentative.findMany({
          where: {
            pocId: { in: pocIds },
            year: { in: [...new Set(Object.values(pocYears))] },
            user: { active: true, deletedAt: null },
          },
          select: { pocId: true, year: true, user: { select: USER_SELECT } },
        });

  return {
    year,
    memberships: posts.map((m) => ({
      groupId: m.groupId,
      groupType: m.group.type,
      role: m.role,
      year: m.year,
      user: toMemberUser(m.user),
    })),
    kiesploeg: kiesploeg.map((m) => ({
      kiesploegId: m.kiesploegId,
      postId: m.postId,
      role: m.role,
      user: toMemberUser(m.user),
    })),
    pocRepresentatives: reps.map((r) => ({
      pocId: r.pocId,
      year: r.year,
      user: toMemberUser(r.user),
    })),
    pocYears,
  };
}

/** Wie er volgens de regels in deze lijst hoort. */
export function desiredFor(row: MailGroupForSync, ctx: DesiredContext): DesiredMembers {
  return desiredMembers({
    sources: row.sources,
    year: row.year ?? ctx.year,
    memberships: ctx.memberships,
    kiesploegMemberships: ctx.kiesploeg,
    pocRepresentatives: ctx.pocRepresentatives,
    pocYears: ctx.pocYears,
    ownerGroupId: row.ownerGroupId,
    // Enkel de jaargroep van het lopende jaar hangt in de hoofdgroep. Die van
    // volgend jaar bestaat al (zodat de nieuwe ploeg ze kan gebruiken) maar
    // komt er pas op 15 juli in; die van vorig jaar valt er dan uit.
    childEmails: row.children
      .filter((child) => child.enabled && child.year === ctx.year)
      .map((child) => child.email),
    extras: row.extras.map((extra) => ({
      email: extra.email,
      kind: extra.kind,
      user: extra.user ? toMemberUser(extra.user) : null,
    })),
  });
}
