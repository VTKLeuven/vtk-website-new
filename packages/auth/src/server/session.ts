import 'server-only';
import { prisma } from '@vtk/db';
import type { SessionPayload } from '../index';
import { currentWorkingYear } from '../lib/workingYear';
import type { Permission } from '../index';
import { auth } from '../auth';
import { hasPermission as rootHasPermission } from '../index';
import { deriveAuthz, userGrantsInclude, type RoleWithPerms } from './grants';

// De join en de interpretatie van rollen staan in `grants.ts`, zodat ook wie
// zonder sessie werkt (een agendafeed, een client) dezelfde regels gebruikt.
export { deriveAuthz, userGrantsInclude } from './grants';

export type McpUserAuthz = {
  id: string;
  name: string;
  active: boolean;
  isSuperAdmin: boolean;
  hasMcpUse: boolean;
  permissions: string[];
  groupCodes: string[];
  roleCodes: string[];
};

export async function resolveMcpUserAuthz(userId: string): Promise<McpUserAuthz | null> {
  const year = currentWorkingYear();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userGrantsInclude(year),
  });
  if (!user || !user.active) return null;

  const permissions = new Set<string>();
  const roleCodes = new Set<string>();
  deriveAuthz(user, (role) => {
    if (role.code) roleCodes.add(role.code);
    for (const rp of role.permissions) permissions.add(rp.permission.code);
  });

  return {
    id: user.id,
    name: user.name,
    active: user.active,
    isSuperAdmin: user.isSuperAdmin,
    hasMcpUse: user.isSuperAdmin || permissions.has('mcp.use'),
    permissions: [...permissions],
    groupCodes: user.memberships.map((m) => m.group.code),
    roleCodes: [...roleCodes],
  };
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
      isStudent: user.isStudent,
      googleLinked: user.googleUserId !== null,
      googleLinkDeferredAt: user.googleLinkDeferredAt?.toISOString() ?? null,
    },
    groups: user.memberships.map((membership) => ({
      id: membership.group.id,
      code: membership.group.code,
      slug: membership.group.slug,
      nameNl: membership.group.nameNl,
      nameEn: membership.group.nameEn,
      role: membership.role,
      type: membership.group.type,
    })),
    permissions: [...permissions],
    roleIds: [...roleIds],
  };
}

/**
 * Het profiel dat de gate in `apps/web/proxy.ts` nodig heeft, en niets meer.
 *
 * Bewust een eigen query naast `getSession`: die lost ook posten, rollen en
 * permissies op (`userGrantsInclude` hierboven), en dat is de zwaarste join van
 * de site. De gate kijkt enkel of het profiel af is, of de studie nog bevestigd
 * moet worden en of er een post is; permissies komen er niet aan te pas.
 *
 * Omdat de proxy op élk verzoek draait, betaalde een ingelogd lid die join
 * voordien twee keer per paginaweergave: hier en nog eens tijdens de render. Die
 * twee delen niets, want de React-`cache` van `getCurrentSession` geldt per
 * render en de WeakMap van `getSessionCached` hangt aan het `Headers`-object,
 * dat op de netwerkgrens een ander is dan in de render.
 *
 * `active` wordt wel degelijk gelezen: een gedeactiveerd lid hoort ook met een
 * geldige cookie niets meer te zien, en die controle mag niet aan de
 * cookie-cache van better-auth overgelaten worden.
 */
export type GateUser = {
  onboarded: boolean;
  isStudent: boolean;
  studyConfirmedYear: number | null;
  googleLinked: boolean;
  googleLinkDeferredAt: string | null;
  /** Zit dit lid dit werkingsjaar in een post of werkgroep (een jaarwerking telt niet)? */
  hasGroups: boolean;
};

export async function getGateUser(headers: Headers): Promise<GateUser | null> {
  const betterSession = await auth.api.getSession({ headers });
  if (!betterSession) return null;

  const user = await prisma.user.findUnique({
    where: { id: betterSession.user.id },
    select: {
      active: true,
      onboardedAt: true,
      isStudent: true,
      studyConfirmedYear: true,
      googleUserId: true,
      googleLinkDeferredAt: true,
      // Enkel het aantal, niet de rijen: de gate wil weten óf er een post is.
      // Een jaarwerking telt niet: wie enkel in Kanweek zit, krijgt niet
      // plots een poort die een @vtk.be-account eist. Staat zo iemand in een
      // groepsadres, dan toont dat scherm hem als niet gekoppeld.
      _count: {
        select: {
          memberships: { where: { year: currentWorkingYear(), group: { type: { not: 'JAARWERKING' } } } },
        },
      },
    },
  });

  if (!user || !user.active) return null;

  return {
    onboarded: user.onboardedAt !== null,
    isStudent: user.isStudent,
    studyConfirmedYear: user.studyConfirmedYear,
    googleLinked: user.googleUserId !== null,
    googleLinkDeferredAt: user.googleLinkDeferredAt?.toISOString() ?? null,
    hasGroups: user._count.memberships > 0,
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
