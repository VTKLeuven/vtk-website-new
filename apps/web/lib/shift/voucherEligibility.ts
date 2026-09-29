import "server-only";

import type { Prisma } from "@prisma/client";
import { currentWorkingYear } from "@vtk/auth";
import { prisma } from "@vtk/db";

/**
 * Wie in het lopende werkingsjaar in een praesidiumpost zit, betaalt in Theokot
 * niet met de bonnetjes op zijn account. Zie "Praesidium betaalt niet met online
 * bonnetjes" in `docs/design-decisions.md`.
 *
 * - Enkel `Group.type = "PRAESIDIUM"`: een werkgroep telt niet mee.
 * - Enkel het lopende werkingsjaar (`currentWorkingYear`, kantelt op 15 juli):
 *   wie vorig jaar in het praesidium zat en nu niet meer, betaalt gewoon.
 * - Het saldo blijft staan. Het wordt enkel niet uitgegeven aan de toog; een
 *   beheerder kan het nog altijd uitbetalen via `/api/shift/reward`.
 *
 * De check hoort aan de serverkant van elke afboeking. Een knop verbergen is
 * gemak voor de balie, geen blokkade.
 */
export async function paysWithVouchersBlocked(
  userId: string,
  now: Date = new Date(),
  db: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: { userId, year: currentWorkingYear(now), group: { type: "PRAESIDIUM" } },
    select: { id: true },
  });
  return membership !== null;
}
