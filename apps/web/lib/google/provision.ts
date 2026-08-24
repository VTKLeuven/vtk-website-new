import "server-only";

import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import type { GoogleConfig } from "./config";
import { GoogleError, addAlias, createUser, listGroups, listUsers } from "./client";
import { generatePassword, proposeAddress } from "./addresses";

/**
 * Accounts aanmaken vanuit de site.
 *
 * Twee redenen waarom dit hier hoort en niet in de Google Admin console: het
 * scheelt de handmatige invoer, en het legt de koppeling tussen het lid en zijn
 * `@vtk.be`-account meteen goed. Wie hier een account krijgt, is per constructie
 * gekoppeld; alleen de accounts die er al waren vragen het koppelscherm.
 *
 * **Aanmaken gaat altijd via een voorbeeld.** `planAccounts` berekent wat er zou
 * gebeuren, het scherm toont het, en pas daarna voert `createAccounts` uit. Een
 * mailadres is achteraf lastig te veranderen.
 */

export type ProvisionTarget = {
  userId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  googleEmail: string | null;
};

export type PlanRow = {
  userId: string;
  name: string;
  /** Voorgesteld primair adres, of leeg wanneer er niets voor te stellen valt. */
  email: string;
  /** Voorgestelde kiesploegalias, of `null` buiten een kiesploeg. */
  alias: string | null;
  /** Waarom deze rij niet aangemaakt kan worden; `null` = klaar om aan te maken. */
  blocked: string | null;
};

export type KiesploegTemplates = {
  code: string;
  accountTemplate: string;
  aliasTemplate: string;
};

/**
 * Alle adressen die al bezet zijn: primaire adressen, aliassen én de
 * groepsadressen. Een gebruiker en een groep kunnen niet hetzelfde adres
 * dragen, dus die laatste horen erbij.
 */
async function takenAddresses(cfg: GoogleConfig): Promise<Set<string>> {
  const [users, groups] = await Promise.all([listUsers(cfg), listGroups(cfg)]);
  const taken = new Set<string>();
  for (const user of users) {
    taken.add(user.primaryEmail.toLowerCase());
    for (const alias of user.aliases ?? []) taken.add(alias.toLowerCase());
  }
  for (const group of groups) taken.add(group.email.toLowerCase());
  return taken;
}

export async function planAccounts(
  cfg: GoogleConfig,
  input: { targets: ProvisionTarget[]; kiesploeg?: KiesploegTemplates | null },
): Promise<PlanRow[]> {
  const taken = await takenAddresses(cfg);
  const accountTemplate = input.kiesploeg?.accountTemplate ?? "{voornaam}.{achternaam}";
  const rows: PlanRow[] = [];

  for (const target of input.targets) {
    if (target.googleEmail) {
      rows.push({
        userId: target.userId,
        name: target.name,
        email: target.googleEmail,
        alias: null,
        blocked: "heeft al een gekoppeld account",
      });
      continue;
    }
    if (!target.firstName?.trim() || !target.lastName?.trim()) {
      rows.push({
        userId: target.userId,
        name: target.name,
        email: "",
        alias: null,
        blocked: "voor- of achternaam ontbreekt in het profiel",
      });
      continue;
    }

    const vars = {
      voornaam: target.firstName,
      achternaam: target.lastName,
      code: input.kiesploeg?.code,
    };
    const email = proposeAddress(accountTemplate, vars, cfg.domain, taken);
    // Meteen bezet verklaren: twee naamgenoten in dezelfde ronde mogen niet
    // allebei hetzelfde adres voorgesteld krijgen.
    taken.add(email);

    let alias: string | null = null;
    if (input.kiesploeg) {
      alias = proposeAddress(input.kiesploeg.aliasTemplate, vars, cfg.domain, taken);
      taken.add(alias);
    }

    rows.push({ userId: target.userId, name: target.name, email, alias, blocked: null });
  }

  return rows;
}

export type CreatedAccount = {
  userId: string;
  name: string;
  email: string;
  /** Eenmalig te tonen; wordt nergens bewaard. */
  password: string | null;
  error: string | null;
};

/**
 * Maakt de gekozen accounts aan.
 *
 * De namen komen uit de database en niet uit het formulier: het scherm stuurt
 * enkel terug wie en welk adres. Het wachtwoord wordt teruggegeven om één keer
 * te tonen en verder nergens bewaard; het account staat op
 * `changePasswordAtNextLogin`.
 */
export async function createAccounts(
  cfg: GoogleConfig,
  rows: { userId: string; email: string; alias: string | null }[],
  options: { orgUnitPath?: string } = {},
): Promise<CreatedAccount[]> {
  const out: CreatedAccount[] = [];

  for (const row of rows) {
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true, name: true, firstName: true, lastName: true, googleUserId: true },
    });
    if (!user) {
      out.push({ userId: row.userId, name: row.userId, email: row.email, password: null, error: "onbekend lid" });
      continue;
    }
    if (user.googleUserId) {
      out.push({ userId: user.id, name: user.name, email: row.email, password: null, error: "had al een account" });
      continue;
    }

    const password = generatePassword();
    try {
      const created = await createUser(cfg, {
        primaryEmail: row.email,
        givenName: user.firstName?.trim() || user.name,
        familyName: user.lastName?.trim() || user.name,
        password,
        orgUnitPath: options.orgUnitPath,
      });

      if (row.alias) {
        try {
          await addAlias(cfg, created.primaryEmail, row.alias);
        } catch (err) {
          // De alias is comfort, het account is de zaak. Meld het en ga door.
          out.push({
            userId: user.id,
            name: user.name,
            email: created.primaryEmail,
            password,
            error: `account aangemaakt, alias mislukt: ${describe(err)}`,
          });
          await linkUser(user.id, created.id, created.primaryEmail, user.name);
          continue;
        }
      }

      await linkUser(user.id, created.id, created.primaryEmail, user.name);
      out.push({
        userId: user.id,
        name: user.name,
        email: created.primaryEmail,
        password,
        error: null,
      });
    } catch (err) {
      const conflict = err instanceof GoogleError && err.status === 409;
      out.push({
        userId: user.id,
        name: user.name,
        email: row.email,
        password: null,
        error: conflict
          ? "dat adres bestaat al in Google; ververs het voorstel"
          : describe(err),
      });
    }
  }

  return out;
}

async function linkUser(
  userId: string,
  googleUserId: string,
  googleEmail: string,
  name: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleUserId,
      googleEmail: googleEmail.toLowerCase(),
      googleLinkedAt: new Date(),
      googleLinkDeferredAt: null,
    },
  });
  await logAudit({
    action: "create",
    entity: "user",
    entityId: userId,
    target: name,
    summary: `Google-account aangemaakt en gekoppeld (${googleEmail})`,
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
