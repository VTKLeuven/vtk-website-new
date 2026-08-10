import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";

/**
 * Live (uit de DB, niet uit de sessie-snapshot) checken of een gebruiker een
 * permissie heeft voor het huidige werkingsjaar.
 *
 * Spiegelt de resolver in `packages/auth/src/server/session.ts`: rechten komen
 * uit rollen, direct toegewezen (`UserRole`) of via een post (`GroupRole`;
 * DEFAULT voor elk lid, LEADER enkel voor de lead).
 *
 * Waarom niet gewoon `session.permissions`: een server action die iets aanmaakt
 * mag niet op een snapshot varen die minuten oud kan zijn. Voor het *tonen* van
 * knoppen is de snapshot prima; voor het *toestaan* van een mutatie niet.
 */
export async function hasLivePermission(userId: string, code: string): Promise<boolean> {
  const year = currentWorkingYear();

  const directRole = await prisma.userRole.findFirst({
    where: {
      userId,
      year,
      role: { permissions: { some: { permission: { code } } } },
    },
    select: { roleId: true },
  });
  if (directRole) return true;

  // Post-granted: DEFAULT telt voor elk lid, LEADER enkel wanneer je de lead bent.
  const memberships = await prisma.groupMembership.findMany({
    where: {
      userId,
      year,
      group: {
        roleGrants: {
          some: { role: { permissions: { some: { permission: { code } } } } },
        },
      },
    },
    select: {
      role: true,
      group: {
        select: {
          roleGrants: {
            where: { role: { permissions: { some: { permission: { code } } } } },
            select: { kind: true },
          },
        },
      },
    },
  });
  return memberships.some((m) =>
    m.group.roleGrants.some((grant) => grant.kind === "DEFAULT" || m.role === "LEAD")
  );
}
