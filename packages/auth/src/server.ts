/**
 * @author Witse Panneels
 * @date 2026-06-19
 *
 * better-auth server components, to be used on central platform / app (@vtk/web)
 * Also includes functions for sso and session validation for remote apps (@vtk/logistiek, ...)
 *
 * If you are working on a remote app, please do not use this file/these components, use ./remote.ts instead!
 *
 * !do not import these into a client component!
 */
import 'server-only';
import { prisma } from '@vtk/db';
import type { SessionPayload } from './index';
import { auth } from './auth';
import { ApiHandler } from './apiHandlers/apiHandler';

export { auth } from './auth'; // kind of would like not to have to do this...
export { getSession, requireSession, requirePermission } from './sessions';
export { hashPassword } from './logins/password';
export { ApiHandler } from './apiHandlers/apiHandler';

export async function getSessionFromHeaders(headers: Headers): Promise<SessionPayload | null> {
  const betterSession = await auth.api.getSession({ headers });
  if (!betterSession) return null;

  const user = await prisma.user.findUnique({
    where: { id: betterSession.user.id },
    include: {
      memberships: {
        include: {
          group: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.active) return null;

  const permissions = new Set<string>();
  const groups: SessionPayload['groups'] = [];

  for (const membership of user.memberships) {
    groups.push({
      id: membership.group.id,
      code: membership.group.code,
      slug: membership.group.slug,
      nameNl: membership.group.nameNl,
      nameEn: membership.group.nameEn,
      role: membership.role,
    });

    for (const entry of membership.group.permissions) {
      permissions.add(entry.permission.code);
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
    },
    groups,
    permissions: [...permissions],
  };
}
