import 'server-only';
import { prisma } from '@vtk/db';
import type { SessionPayload } from '../index';
import { auth } from '../auth';

export async function getSession(headers: Headers): Promise<SessionPayload | null> {
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

  for (const membership of user.memberships) {
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
    groups: user.memberships.map((membership) => ({
      id: membership.group.id,
      code: membership.group.code,
      slug: membership.group.slug,
      nameNl: membership.group.nameNl,
      nameEn: membership.group.nameEn,
      role: membership.role,
    })),
    permissions: [...permissions],
  };
}
