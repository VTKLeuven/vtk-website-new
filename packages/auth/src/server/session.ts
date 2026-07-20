import 'server-only';
import { prisma } from '@vtk/db';
import type { SessionPayload } from '../index';
import { currentWorkingYear } from '../lib/workingYear';
import type { Permission } from '../index';
import { auth } from '../auth';
import { hasPermission as rootHasPermission } from '../index';

// Rollen bundelen permissies; hieruit halen we de codes (en het rol-id zelf,
// voor checks die aan een specifieke rol hangen zoals paginabewerking).
type RoleWithPerms = { id: string; permissions: { permission: { code: string } }[] };

export async function getSession(headers: Headers): Promise<SessionPayload | null> {
  const betterSession = await auth.api.getSession({ headers });
  if (!betterSession) return null;

  // Permissies worden per werkingsjaar bepaald: enkel de rollen en
  // postlidmaatschappen van het huidige jaar tellen mee. Zo resetten rechten
  // automatisch op 15 juli (behalve isSuperAdmin, zie hieronder).
  const year = currentWorkingYear();

  const user = await prisma.user.findUnique({
    where: { id: betterSession.user.id },
    include: {
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
    },
  });

  if (!user || !user.active) return null;

  const permissions = new Set<string>();
  const roleIds = new Set<string>();
  const addRolePermissions = (role: RoleWithPerms) => {
    roleIds.add(role.id);
    for (const rp of role.permissions) permissions.add(rp.permission.code);
  };

  // 1. Direct toegewezen rollen.
  for (const userRole of user.roles) addRolePermissions(userRole.role);

  // 2. Rollen via de post: DEFAULT voor elk lid, LEADER enkel voor de lead.
  for (const membership of user.memberships) {
    for (const grant of membership.group.roleGrants) {
      if (grant.kind === 'LEADER' && membership.role !== 'LEAD') continue;
      addRolePermissions(grant.role);
    }
  }

  return {
    token: betterSession.session.token,
    expiresAt: betterSession.session.expiresAt.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarKey: user.avatarKey,
      locale: user.locale,
      isSuperAdmin: user.isSuperAdmin,
      onboarded: user.onboardedAt !== null,
      studyConfirmedYear: user.studyConfirmedYear,
    },
    groups: user.memberships.map((membership) => ({
      id: membership.group.id,
      code: membership.group.code,
      slug: membership.group.slug,
      nameNl: membership.group.nameNl,
      nameEn: membership.group.nameEn,
      role: membership.role,
    })),
    permissions: [...permissions],
    roleIds: [...roleIds],
  };
}

/**
 * check if a user has the correct permissions from the headers (with simple cache as to limit the amount of DB hits)
 *
 * Only use this function in non react/nextjs methods => in those case use reacts native cache() function
 *
 * De cache raakt vandaag nooit: de enige oproeper is `hasSSOPrivileges`, en de
 * plugin roept die precies één keer per client-mutatie aan. Ze blijft staan
 * voor wanneer één request wél twee checks doet. Let dan op: de WeakMap hangt
 * aan de identiteit van het `Headers`-object, dus verifieer eerst met een
 * teller dat Next dat object hergebruikt.
 */
export async function hasPermission(headers: Headers, permission: Permission): Promise<boolean> {
  if (!sessionCache.has(headers)) sessionCache.set(headers, getSession(headers));

  return rootHasPermission(await sessionCache.get(headers), permission);
}

const sessionCache = new WeakMap<Headers, Promise<SessionPayload | null>>();
