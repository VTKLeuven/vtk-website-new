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

/**
 * De join die "welke rechten heeft dit lid" beantwoordt: rechtstreeks
 * toegewezen rollen plus de rollen die een post toekent, allebei gescoped op
 * het werkingsjaar.
 *
 * Staat los van `getSession`, zijn enige huidige oproeper, omdat fase 5 dezelfde
 * rijen nodig heeft om de permissies van een client op te lossen. Hergebruik ze
 * daar in plaats van de query over te tikken: twee resolvers die van mening
 * kunnen verschillen over wat een lid mag, is hier de slechtst mogelijke afloop.
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

export async function getSession(headers: Headers): Promise<SessionPayload | null> {
  const betterSession = await auth.api.getSession({ headers });
  if (!betterSession) return null;

  // Permissies worden per werkingsjaar bepaald: enkel de rollen en
  // postlidmaatschappen van het huidige jaar tellen mee. Zo resetten rechten
  // automatisch op 15 juli (behalve isSuperAdmin, zie hieronder).
  const year = currentWorkingYear();

  const user = await prisma.user.findUnique({
    where: { id: betterSession.user.id },
    include: userGrantsInclude(year),
  });

  if (!user || !user.active) return null;

  const permissions = new Set<string>();
  const roleIds = new Set<string>();
  const addRolePermissions = (role: RoleWithPerms) => {
    roleIds.add(role.id);
    for (const rp of role.permissions) permissions.add(rp.permission.code);
  };

  deriveAuthz(user, addRolePermissions);

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
 * De sessie voor deze `Headers`, hoogstens één keer per object opgehaald.
 *
 * `getSession` doet een zware query (posten, rollen, permissies), dus elke
 * herhaling telt. Gebruik deze en niet `getSession` zodra binnen één request
 * meerdere dingen de sessie nodig hebben.
 *
 * De cache hangt aan de identiteit van het `Headers`-object: krijgt een andere
 * laag een kopie, dan mist ze gewoon en wordt er opnieuw geladen. Nooit fout,
 * hoogstens trager.
 *
 * Only use this function in non react/nextjs methods => in those case use reacts native cache() function
 */
export function getSessionCached(headers: Headers): Promise<SessionPayload | null> {
  let cached = sessionCache.get(headers);
  if (!cached) {
    cached = getSession(headers);
    sessionCache.set(headers, cached);
  }
  return cached;
}

/** Zie getSessionCached: deelt dezelfde cache. */
export async function hasPermission(headers: Headers, permission: Permission): Promise<boolean> {
  return rootHasPermission(await getSessionCached(headers), permission);
}

const sessionCache = new WeakMap<Headers, Promise<SessionPayload | null>>();
