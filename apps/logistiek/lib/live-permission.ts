import 'server-only';

import { prisma } from '@vtk/db';
import { currentWorkingYear, type Permission } from '@vtk/auth';

/**
 * Heeft deze gebruiker dit recht nu, gelezen uit de databank en niet uit een
 * sessie?
 *
 * Voor wat zonder sessie binnenkomt maar namens iemand werkt, zoals de
 * agendafeed: een token dat iemand met `logistiek.manage` ooit aanmaakte, mag
 * na de reset van 15 juli niet blijven werken voor wie dat recht kwijt is.
 *
 * Dezelfde regels als de sessie (`deriveAuthz` in packages/auth): rollen van
 * dit werkingsjaar, direct toegewezen of via een post (DEFAULT voor elk lid,
 * LEADER enkel voor de lead), en een superadmin mag alles, zoals
 * `hasPermission`. Een gedeactiveerd account heeft geen rechten. Spiegelt
 * `hasLivePermission` in apps/web/lib/livePermissions.ts; die is niet te
 * importeren, en `@vtk/auth/server` laadt hier de volledige better-auth mee.
 */
export async function hasLivePermission(userId: string, code: Permission): Promise<boolean> {
  const year = currentWorkingYear();
  const grants = { role: { permissions: { some: { permission: { code } } } } };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      active: true,
      deletedAt: true,
      isSuperAdmin: true,
      roles: { where: { year, ...grants }, select: { roleId: true }, take: 1 },
      memberships: {
        where: { year, group: { roleGrants: { some: grants } } },
        select: {
          role: true,
          group: { select: { roleGrants: { where: grants, select: { kind: true } } } },
        },
      },
    },
  });
  if (!user || !user.active || user.deletedAt) return false;
  if (user.isSuperAdmin || user.roles.length > 0) return true;
  return user.memberships.some((membership) =>
    membership.group.roleGrants.some((grant) => grant.kind === 'DEFAULT' || membership.role === 'LEAD'),
  );
}
