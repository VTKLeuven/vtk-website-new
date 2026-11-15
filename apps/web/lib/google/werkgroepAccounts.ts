import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { logAudit } from "@/lib/audit";
import type { GoogleConfig } from "./config";
import { GoogleError, createUser } from "./client";
import { generatePassword, proposeAddress } from "./addresses";
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
