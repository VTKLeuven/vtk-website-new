import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";

import type { PraesidiumYears } from "@/lib/shift/rewards";

/**
 * Wie in een werkingsjaar in een praesidiumpost zit, verdient met zijn shiften
 * van dat jaar geen bonnetjes. De shiften tellen wel mee; enkel de beloning valt
 * weg (`earnedShiftReward` in `rewards.ts`). Zie "Praesidium verdient geen
 * bonnetjes" in `docs/design-decisions.md`.
 *
 * - Enkel `Group.type = "PRAESIDIUM"`: een werkgroep telt niet mee.
 * - Per werkingsjaar: wie vorig jaar in het praesidium zat, verdient met zijn
 *   shiften van dit jaar gewoon weer, en omgekeerd blijft wat hij verdiende voor
 *   hij praesidium werd staan. Uitgeven mag hij dat ook.
 *
 * Er is geen kolom die dit bewaart: de regel wordt telkens uitgerekend uit de
 * lidmaatschappen. Wie laat in een post gezet wordt, verliest dus meteen de
 * openstaande bonnetjes van zijn shiften van dat jaar, en wie eruit gehaald
 * wordt, krijgt ze terug. Wat al uitbetaald of uitgegeven werd, blijft dat.
 *
 * Zonder `userIds` komt iedereen terug (de beheerlijsten over alle gebruikers).
 */
export async function praesidiumYears(
  userIds?: readonly string[],
  db: Prisma.TransactionClient = prisma,
): Promise<PraesidiumYears> {
  if (userIds && userIds.length === 0) return new Map();
  const rows = await db.groupMembership.findMany({
    where: {
      group: { type: "PRAESIDIUM" },
      ...(userIds ? { userId: { in: [...new Set(userIds)] } } : {}),
    },
    select: { userId: true, year: true },
  });
  const byUser = new Map<string, Set<number>>();
  for (const { userId, year } of rows) {
    const years = byUser.get(userId) ?? new Set<number>();
    years.add(year);
    byUser.set(userId, years);
  }
  return byUser;
}
