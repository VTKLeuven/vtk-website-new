import 'server-only';
import { prisma } from '@vtk/db';
import type { Permission } from '../index';
import { currentWorkingYear } from '../lib/workingYear';

// Rollen bundelen permissies; hieruit halen we de codes (en het rol-id zelf,
// voor checks die aan een specifieke rol hangen zoals paginabewerking).
export type RoleWithPerms = { id: string; code?: string; permissions: { permission: { code: string } }[] };

/**
 * De join die "welke rechten heeft dit lid" beantwoordt: rechtstreeks
 * toegewezen rollen plus de rollen die een post toekent, allebei gescoped op
 * het werkingsjaar.
 *
 * Staat los van `getSession` omdat meer plekken dezelfde rijen nodig hebben:
 * de permissies van een client (`clientPermissions.ts`) en de rechten van wie
 * een agendafeed van de uitleendienst bezit (`userHasPermission` hieronder).
 * Hergebruik ze daar in plaats van de query over te tikken: twee resolvers die
 * van mening kunnen verschillen over wat een lid mag, is hier de slechtst
 * mogelijke afloop.
 *
 * Dit bestand importeert bewust geen `auth`: zo kan een app zonder better-auth
 * (de uitleendienst, via `@vtk/auth/grants`) dezelfde regels gebruiken.
 *
 * `as const` blijft staan: zonder de letterlijke `true` in `include` verliest
 * Prisma de inferentie en wordt het resultaat te breed getypeerd.
 */
export function userGrantsInclude(year: number) {
  return {
    memberships: {
      where: { year },
      include: {
        group: {
          include: {
            // Rollen die de post toekent aan leden (DEFAULT) en lead (LEADER).
            roleGrants: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    },
    // Direct toegewezen rollen voor dit werkingsjaar.
    roles: {
      where: { year },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    },
  } as const;
}

/** Wat `deriveAuthz` minimaal nodig heeft; `getSession` laadt meer. */
type UserWithGrants = {
  roles: { role: RoleWithPerms }[];
  memberships: { role: string; group: { roleGrants: { kind: string; role: RoleWithPerms }[] } }[];
};

/**
 * Loopt de rollen van een lid af: direct toegewezen rollen, plus de rollen die
 * een post toekent (DEFAULT aan elk lid, LEADER enkel aan de verantwoordelijke).
 *
 * Staat apart zodat de claim-resolver dezelfde regels gebruikt als de sessie.
 * Twee implementaties van "welke rechten heeft dit lid" is precies hoe die twee
 * uit elkaar gaan lopen.
 */
export function deriveAuthz(user: UserWithGrants, addRole: (role: RoleWithPerms) => void): void {
  for (const userRole of user.roles) addRole(userRole.role);

  for (const membership of user.memberships) {
    for (const grant of membership.group.roleGrants) {
      if (grant.kind === 'LEADER' && membership.role !== 'LEAD') continue;
      addRole(grant.role);
    }
  }
}

/**
 * Heeft dit lid dit recht, nu, zonder sessie?
 *
 * Voor wat buiten een sessie om met de rechten van iemand werkt, zoals een
 * agendafeed die met een token in de URL authenticeert: die rechten resetten
 * op 15 juli, het token niet. Dezelfde regels als `hasPermission` op een
 * sessie, de superadmin-bypass inbegrepen; een inactief of verwijderd account
 * heeft niets.
 */
export async function userHasPermission(userId: string, code: Permission): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userGrantsInclude(currentWorkingYear()),
  });
  if (!user || !user.active || user.deletedAt) return false;
  if (user.isSuperAdmin) return true;

  let found = false;
  deriveAuthz(user, (role) => {
    if (role.permissions.some((rp) => rp.permission.code === code)) found = true;
  });
  return found;
}
