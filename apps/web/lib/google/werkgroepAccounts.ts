import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { logAudit } from "@/lib/audit";
import type { GoogleConfig } from "./config";
import { GoogleError, createUser, getUser, listUsersLite } from "./client";
import { generatePassword, proposeAddress, renderAddress } from "./addresses";
import { takenAddresses } from "./provision";

/**
 * Accounts van een werkgroep: statix.voornaam.achternaam@vtk.be.
 *
 * Een werkgroep vraagt ze zelf aan voor haar leden; IT of de vice
 * (`googleAccounts.manage`) keurt goed, en pas dan maakt de site het account.
 * Zie docs/design-decisions.md, "Werkgroepen beheren hun eigen adressen".
 *
 * Dit is een tweede account naast het persoonlijke (`User.googleEmail`), en
 * daarom een eigen tabel: wie in Statix én in het praesidium zit, heeft er twee.
 */

/** Het sjabloon van een werkgroepaccount; het voorvoegsel komt van de werkgroep. */
export const WERKGROEP_ACCOUNT_TEMPLATE = "{prefix}.{voornaam}.{achternaam}";

/** Adressen die de site al kent: genoeg voor een voorstel bij het aanvragen. */
async function knownAddresses(): Promise<Set<string>> {
  const [accounts, users, groups] = await Promise.all([
    prisma.werkgroepAccount.findMany({ select: { email: true } }),
    prisma.user.findMany({ where: { googleEmail: { not: null } }, select: { googleEmail: true } }),
    prisma.mailGroup.findMany({ select: { email: true } }),
  ]);
  return new Set([
    ...accounts.map((a) => a.email),
    ...users.map((u) => u.googleEmail as string),
    ...groups.map((g) => g.email),
  ]);
}

export type RequestOutcome = { requested: number; skipped: string[] };

/**
 * Vraagt accounts aan voor leden van een werkgroep. Enkel wie dit werkingsjaar
 * lid is; wie al een account of een open aanvraag heeft, wordt overgeslagen.
 * Een geweigerde aanvraag mag opnieuw.
 */
export async function requestWerkgroepAccounts(input: {
  groupId: string;
  userIds: string[];
  requestedById: string;
  domain: string;
}): Promise<RequestOutcome> {
  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    select: { nameNl: true, mailPrefix: true },
  });
  if (!group?.mailPrefix) return { requested: 0, skipped: ["geen voorvoegsel"] };

  const memberships = await prisma.groupMembership.findMany({
    where: {
      groupId: input.groupId,
      year: currentWorkingYear(),
      userId: { in: input.userIds },
      user: { active: true, deletedAt: null },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          werkgroepAccounts: { where: { groupId: input.groupId }, select: { id: true, status: true, email: true } },
        },
      },
    },
  });

  const taken = await knownAddresses();
  let requested = 0;
  const skipped: string[] = [];

  for (const { user } of memberships) {
    const current = user.werkgroepAccounts[0];
    if (current && current.status !== "REJECTED") {
      skipped.push(user.name);
      continue;
    }
    if (!user.firstName?.trim() || !user.lastName?.trim()) {
      skipped.push(`${user.name} (geen voor- of achternaam)`);
      continue;
    }
    if (current) taken.delete(current.email);
    const email = proposeAddress(
      WERKGROEP_ACCOUNT_TEMPLATE,
      { prefix: group.mailPrefix, voornaam: user.firstName, achternaam: user.lastName },
      input.domain,
      taken,
    );
    taken.add(email);

    await prisma.werkgroepAccount.upsert({
      where: { userId_groupId: { userId: user.id, groupId: input.groupId } },
      create: {
        userId: user.id,
        groupId: input.groupId,
        email,
        requestedById: input.requestedById,
      },
      update: {
        email,
        status: "REQUESTED",
        requestedById: input.requestedById,
        requestedAt: new Date(),
        decidedById: null,
        decidedAt: null,
        rejectReason: null,
      },
    });
    // Wie toch een account aanvraagt, had het dus wel nodig.
    await prisma.werkgroepAccountSkip.deleteMany({ where: { userId: user.id, groupId: input.groupId } });
    requested += 1;
    await logAudit({
      action: "create",
      entity: "werkgroepAccount",
      target: user.name,
      summary: `account aangevraagd: ${email} (${group.nameNl})`,
    });
  }

  return { requested, skipped };
}

export type ApproveOutcome =
  | { ok: true; name: string; email: string; password: string }
  | { ok: false; name: string; error: string };

/**
 * Keurt een aanvraag goed en maakt het account meteen aan.
 *
 * Het adres wordt opnieuw berekend tegen wat er nu in Google staat: tussen de
 * aanvraag en de goedkeuring kan iemand anders het genomen hebben. Het
 * wachtwoord wordt één keer teruggegeven en nergens bewaard, zoals bij elk
 * account dat de site maakt.
 */
export async function approveWerkgroepAccount(
  cfg: GoogleConfig,
  id: string,
  decidedById: string,
): Promise<ApproveOutcome> {
  const row = await prisma.werkgroepAccount.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      email: true,
      groupId: true,
      group: { select: { nameNl: true, mailPrefix: true } },
      user: { select: { id: true, name: true, firstName: true, lastName: true } },
    },
  });
  if (!row) return { ok: false, name: "?", error: "onbekende aanvraag" };
  const name = row.user.name;
  if (row.status !== "REQUESTED") return { ok: false, name, error: "niet meer open" };
  if (!row.group.mailPrefix || !row.user.firstName || !row.user.lastName) {
    return { ok: false, name, error: "voorvoegsel of naam ontbreekt" };
  }

  let email: string;
  try {
    const taken = await takenAddresses(cfg);
    email = taken.has(row.email)
      ? proposeAddress(
          WERKGROEP_ACCOUNT_TEMPLATE,
          { prefix: row.group.mailPrefix, voornaam: row.user.firstName, achternaam: row.user.lastName },
          cfg.domain,
          taken,
        )
      : row.email;
  } catch (err) {
    return { ok: false, name, error: err instanceof Error ? err.message : String(err) };
  }

  const password = generatePassword();
  try {
    const created = await createUser(cfg, {
      primaryEmail: email,
      givenName: row.user.firstName,
      familyName: `${row.user.lastName} (${row.group.nameNl})`,
      password,
      orgUnitPath: cfg.fullOrgUnit,
    });
    await prisma.werkgroepAccount.update({
      where: { id },
      data: {
        status: "ACTIVE",
        email: created.primaryEmail.toLowerCase(),
        googleUserId: created.id,
        decidedById,
        decidedAt: new Date(),
      },
    });
    await logAudit({
      action: "create",
      entity: "werkgroepAccount",
      entityId: id,
      target: name,
      summary: `account goedgekeurd en aangemaakt: ${created.primaryEmail}`,
    });
    return { ok: true, name, email: created.primaryEmail, password };
  } catch (err) {
    const conflict = err instanceof GoogleError && err.status === 409;
    return {
      ok: false,
      name,
      error: conflict ? "dat adres bestaat al in Google" : err instanceof Error ? err.message : String(err),
    };
  }
}

export async function rejectWerkgroepAccount(id: string, reason: string, decidedById: string): Promise<boolean> {
  const row = await prisma.werkgroepAccount.findUnique({
    where: { id },
    select: { status: true, email: true, user: { select: { name: true } } },
  });
  if (!row || row.status !== "REQUESTED") return false;
  await prisma.werkgroepAccount.update({
    where: { id },
    data: { status: "REJECTED", rejectReason: reason || null, decidedById, decidedAt: new Date() },
  });
  await logAudit({
    action: "update",
    entity: "werkgroepAccount",
    entityId: id,
    target: row.user.name,
    summary: `aanvraag geweigerd: ${row.email}${reason ? ` (${reason})` : ""}`,
  });
  return true;
}

/** Het adres dat een lid in deze werkgroep zou krijgen, zonder rekening te houden met naamgenoten. */
export function expectedWerkgroepAddress(
  prefix: string,
  user: { firstName: string | null; lastName: string | null },
  domain: string,
): string | null {
  if (!user.firstName?.trim() || !user.lastName?.trim()) return null;
  return renderAddress(
    WERKGROEP_ACCOUNT_TEMPLATE,
    { prefix, voornaam: user.firstName, achternaam: user.lastName },
    domain,
  ).toLowerCase();
}

/**
 * Alle adressen die nu in Google bestaan, om een werkgroepaccount te herkennen
 * dat er al was voor de site het aanmaakte (met de hand in de Admin console).
 * Null wanneer Google niet bereikbaar is: dan toont de pagina gewoon wat ze
 * zelf weet, in plaats van te falen.
 */
export async function existingGoogleAddresses(cfg: GoogleConfig | null): Promise<Map<string, string> | null> {
  if (!cfg) return null;
  try {
    const users = await listUsersLite(cfg);
    return new Map(users.map((user) => [user.primaryEmail.toLowerCase(), user.id]));
  } catch {
    return null;
  }
}

/** Duidt leden aan die geen werkgroepaccount nodig hebben, of zet dat terug. */
export async function setWerkgroepAccountSkip(input: {
  groupId: string;
  userIds: string[];
  skip: boolean;
  markedById: string;
}): Promise<number> {
  const group = await prisma.group.findUnique({ where: { id: input.groupId }, select: { nameNl: true } });
  if (!group) return 0;
  // Enkel leden van dit werkingsjaar, zoals bij het aanvragen.
  const members = await prisma.groupMembership.findMany({
    where: { groupId: input.groupId, year: currentWorkingYear(), userId: { in: input.userIds } },
    select: { user: { select: { id: true, name: true } } },
  });
  let changed = 0;
  for (const { user } of members) {
    if (input.skip) {
      await prisma.werkgroepAccountSkip.upsert({
        where: { userId_groupId: { userId: user.id, groupId: input.groupId } },
        create: { userId: user.id, groupId: input.groupId, markedById: input.markedById },
        update: {},
      });
    } else {
      await prisma.werkgroepAccountSkip.deleteMany({ where: { userId: user.id, groupId: input.groupId } });
    }
    changed += 1;
    await logAudit({
      action: "update",
      entity: "werkgroepAccount",
      target: user.name,
      summary: input.skip
        ? `geen werkgroepaccount nodig (${group.nameNl})`
        : `werkgroepaccount toch nodig (${group.nameNl})`,
    });
  }
  return changed;
}

export type LinkOutcome = { linked: string[]; missing: string[] };

/**
 * Koppelt leden aan het werkgroepaccount dat al in Google bestaat op het adres
 * dat de site zou voorstellen. Geen account aanmaken, geen wachtwoord: het
 * account was er al. Daarna krijgt het lid dat adres in de lijsten van de
 * werkgroep, net als na een goedkeuring.
 */
export async function linkExistingWerkgroepAccounts(
  cfg: GoogleConfig,
  input: { groupId: string; userIds: string[]; decidedById: string },
): Promise<LinkOutcome> {
  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    select: { nameNl: true, mailPrefix: true },
  });
  if (!group?.mailPrefix) return { linked: [], missing: [] };
  const members = await prisma.groupMembership.findMany({
    where: { groupId: input.groupId, year: currentWorkingYear(), userId: { in: input.userIds } },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          werkgroepAccounts: { where: { groupId: input.groupId }, select: { status: true } },
        },
      },
    },
  });
  const outcome: LinkOutcome = { linked: [], missing: [] };
  for (const { user } of members) {
    const current = user.werkgroepAccounts[0];
    if (current && current.status !== "REJECTED") continue;
    const email = expectedWerkgroepAddress(group.mailPrefix, user, cfg.domain);
    const found = email ? await getUser(cfg, email) : null;
    // Google geeft ook een account terug op een alias; dan is het iemands ander
    // adres (bv. zijn persoonlijke account) en geen werkgroepaccount.
    const google = found && found.primaryEmail.toLowerCase() === email ? found : null;
    if (!email || !google) {
      outcome.missing.push(user.name);
      continue;
    }
    // Het adres is uniek; hangt het al aan iemand anders, dan koppelen we niets.
    const taken = await prisma.werkgroepAccount.findFirst({
      where: { OR: [{ email }, { googleUserId: google.id }], NOT: { userId: user.id, groupId: input.groupId } },
      select: { id: true },
    });
    if (taken) {
      outcome.missing.push(user.name);
      continue;
    }
    const now = new Date();
    await prisma.werkgroepAccount.upsert({
      where: { userId_groupId: { userId: user.id, groupId: input.groupId } },
      create: {
        userId: user.id,
        groupId: input.groupId,
        email,
        googleUserId: google.id,
        status: google.suspended ? "SUSPENDED" : "ACTIVE",
        requestedById: input.decidedById,
        decidedById: input.decidedById,
        decidedAt: now,
      },
      update: {
        email,
        googleUserId: google.id,
        status: google.suspended ? "SUSPENDED" : "ACTIVE",
        decidedById: input.decidedById,
        decidedAt: now,
        rejectReason: null,
      },
    });
    await prisma.werkgroepAccountSkip.deleteMany({ where: { userId: user.id, groupId: input.groupId } });
    outcome.linked.push(user.name);
    await logAudit({
      action: "update",
      entity: "werkgroepAccount",
      target: user.name,
      summary: `bestaand account gekoppeld: ${email} (${group.nameNl})`,
    });
  }
  return outcome;
}
