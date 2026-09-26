import "server-only";

import { prisma } from "@vtk/db";
// Rechtstreeks uit @prisma/client, niet via @vtk/db: dat package exporteert
// bewust enkel `prisma` (zie AGENTS.md).
import type { Membership, MembershipKind } from "@prisma/client";
import { currentStudyYear } from "@/lib/workingYear";
import {
  DEFAULT_MEMBERSHIP_CONFIG,
  MEMBERSHIP_CONFIG_KEY,
  parseMembershipConfig,
  type MembershipConfig,
} from "./config";

/**
 * Lidmaatschap van de kring, per academiejaar.
 *
 * Het lidmaatschap loopt op dezelfde klok als de studiebevestiging
 * (`currentStudyYear()`, cutover 14 september) en niet op het werkingsjaar: het
 * wordt op datzelfde scherm gevraagd, en "lid voor 26-27" is een academiejaar.
 *
 * Wie aan de faculteit Ingenieurswetenschappen studeert wordt gratis lid;
 * iedereen anders betaalt. De kringkeuzes staan in `docs/design-decisions.md`.
 */

export async function getMembershipConfig(): Promise<MembershipConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: MEMBERSHIP_CONFIG_KEY } });
    return parseMembershipConfig(row?.value);
  } catch {
    return DEFAULT_MEMBERSHIP_CONFIG;
  }
}

export async function saveMembershipConfig(config: MembershipConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: MEMBERSHIP_CONFIG_KEY },
    update: { value: config },
    create: { key: MEMBERSHIP_CONFIG_KEY, value: config },
  });
}

/** Het lidmaatschap van dit lid voor een academiejaar, betaald of niet. */
export async function getMembership(
  userId: string,
  year: number = currentStudyYear(),
): Promise<Membership | null> {
  return prisma.membership.findUnique({ where: { userId_year: { userId, year } } });
}

/**
 * Of dit lidmaatschap ook echt geldt. Een betalend lidmaatschap waarvan de
 * betaling nog openstaat, is een intentie en geen lidmaatschap; `activatedAt`
 * is precies dat verschil.
 */
export function membershipIsActive(membership: Pick<Membership, "activatedAt"> | null): boolean {
  return membership?.activatedAt != null;
}

/**
 * Wie voor de kring als lid telt.
 *
 * Twee wegen, en dat is bewust. Een student van de faculteit is lid zodra KU
 * Leuven dat bevestigt (`User.firwStudent`, uit `eduPersonOrgUnitDN`): die
 * bevestiging is sterker dan een vinkje, en zonder die tak zou het halve
 * publiek van de kring buiten staan tot iedereen het formulier ooit eens
 * invulde. Daarnaast telt een geactiveerd lidmaatschap van dit academiejaar,
 * en daar maakt het niet uit of het gratis, betaald of door een beheerder
 * toegekend is.
 *
 * Een DB-lezing, want `SessionPayload` draagt permissies en posten, geen
 * ledenstatus; dat uitbreiden zou elke sessielezing op de hele site duurder
 * maken voor iets wat enkel de ticketshop en /account nodig hebben.
 */
export async function userIsMember(
  userId: string | undefined,
  year: number = currentStudyYear(),
): Promise<boolean> {
  if (!userId) return false;
  const [user, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firwStudent: true } }),
    prisma.membership.findUnique({
      where: { userId_year: { userId, year } },
      select: { activatedAt: true },
    }),
  ]);
  return (user?.firwStudent ?? false) || membershipIsActive(membership);
}

// Het aanbod zelf is pure logica en staat in `offer.ts`, zodat het
// clientformulier van de onboarding het type kan lezen zonder prisma mee te
// slepen. Hier her-geëxporteerd, zodat een server call site één import heeft.
export {
  membershipChoiceLabels,
  membershipOffer,
  type MembershipOffer,
} from "./offer";

/**
 * Legt de keuze van het lid vast. Gratis en handmatig staan meteen geactiveerd;
 * een betalend lidmaatschap wacht op zijn betaling.
 *
 * Idempotent op (`userId`, `year`): twee keer bevestigen maakt geen tweede
 * lidmaatschap en zet een bestaand, geactiveerd lidmaatschap nooit terug open.
 */
export async function recordMembershipChoice(
  userId: string,
  kind: MembershipKind,
  options: { year?: number; priceCents?: number; grantedById?: string; note?: string } = {},
): Promise<Membership> {
  const year = options.year ?? currentStudyYear();
  const priceCents = options.priceCents ?? 0;
  const activatedAt = kind === "EXTERNAL" ? null : new Date();

  const existing = await prisma.membership.findUnique({ where: { userId_year: { userId, year } } });
  if (existing) {
    // Een lopend lidmaatschap mag niet gedegradeerd worden: wie al betaald
    // heeft, verliest dat niet doordat het formulier nog eens gepost wordt.
    if (existing.activatedAt) return existing;
    return prisma.membership.update({
      where: { id: existing.id },
      data: {
        kind,
        priceCents,
        activatedAt,
        grantedById: options.grantedById ?? existing.grantedById,
        note: options.note ?? existing.note,
      },
    });
  }

  return prisma.membership.create({
    data: {
      userId,
      year,
      kind,
      priceCents,
      activatedAt,
      grantedById: options.grantedById ?? null,
      note: options.note ?? null,
    },
  });
}

/** Zet een betalend lidmaatschap om in een geldig lidmaatschap. Idempotent. */
export async function activateMembership(membershipId: string): Promise<void> {
  await prisma.membership.updateMany({
    where: { id: membershipId, activatedAt: null },
    data: { activatedAt: new Date() },
  });
}

export type MemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  rNumber: string | null;
  kind: MembershipKind;
  priceCents: number;
  activatedAt: Date | null;
  createdAt: Date;
  grantedByName: string | null;
  note: string | null;
};

/**
 * De ledenlijst van een academiejaar, voor de beheertabel en de export.
 *
 * `pending` neemt ook de lidmaatschappen mee waarvan de betaling nog openstaat:
 * het beheer wil net kunnen zien wie afhaakte in het betaalscherm. Standaard
 * staan ze er niet bij, want "het ledenaantal" zijn de echte leden.
 */
export async function listMembers(
  year: number,
  options: { pending?: boolean } = {},
): Promise<MemberRow[]> {
  const rows = await prisma.membership.findMany({
    where: { year, ...(options.pending ? {} : { activatedAt: { not: null } }) },
    include: {
      user: { select: { id: true, name: true, email: true, rNumber: true } },
      grantedBy: { select: { name: true } },
    },
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => ({
    membershipId: row.id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    rNumber: row.user.rNumber,
    kind: row.kind,
    priceCents: row.priceCents,
    activatedAt: row.activatedAt,
    createdAt: row.createdAt,
    grantedByName: row.grantedBy?.name ?? null,
    note: row.note,
  }));
}

export type MembershipTotals = {
  active: number;
  pending: number;
  byKind: Record<MembershipKind, number>;
  revenueCents: number;
};

/** Het globale ledenaantal van een academiejaar, uitgesplitst per herkomst. */
export async function membershipTotals(year: number): Promise<MembershipTotals> {
  const [grouped, pending] = await Promise.all([
    prisma.membership.groupBy({
      by: ["kind"],
      where: { year, activatedAt: { not: null } },
      _count: { _all: true },
      _sum: { priceCents: true },
    }),
    prisma.membership.count({ where: { year, activatedAt: null } }),
  ]);

  const byKind: Record<MembershipKind, number> = { FACULTY: 0, EXTERNAL: 0, MANUAL: 0 };
  let active = 0;
  let revenueCents = 0;
  for (const row of grouped) {
    byKind[row.kind] = row._count._all;
    active += row._count._all;
    revenueCents += row._sum.priceCents ?? 0;
  }
  return { active, pending, byKind, revenueCents };
}

/** De academiejaren waarvoor er lidmaatschappen bestaan, nieuwste eerst. */
export async function membershipYears(): Promise<number[]> {
  const rows = await prisma.membership.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  const years = rows.map((row) => row.year);
  const current = currentStudyYear();
  return years.includes(current) ? years : [current, ...years];
}

export type HonoraryMemberRow = {
  userId: string;
  name: string;
  email: string;
  rNumber: string | null;
};

/**
 * De ereleden (`User.honoraryMember`), voor de tweede lijst op /admin/leden.
 *
 * Niet per academiejaar: erelid ben je tot een beheerder het intrekt. Een
 * verwijderd account valt weg, ook al zou de vlag nog staan.
 */
export async function listHonoraryMembers(): Promise<HonoraryMemberRow[]> {
  const rows = await prisma.user.findMany({
    where: { honoraryMember: true, deletedAt: null },
    select: { id: true, name: true, email: true, rNumber: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    rNumber: row.rNumber,
  }));
}
