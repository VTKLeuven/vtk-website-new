/**
 * @author Witse Panneels
 * @date 2026-06-25
 */
import 'server-only';
import { prisma } from '@vtk/db';
import { auth } from './auth';
import { AuthError } from './index';
import type { SessionPayload } from './index';

export async function getSession(headers: Headers): Promise<SessionPayload | null> {
  const betterSession = await auth.api.getSession({ headers });
  if (!betterSession) return null;

  const vtkUser = await prisma.user.findUnique({
    where: { id: betterSession.user.id },
    include: {
      memberships: {
        include: {
          group: {
            include: {
              permissions: true,
            },
          },
        },
      },
    },
  });

  if (!vtkUser || !vtkUser.active) return null;

  const permissions = new Set<string>();
  for (const membership of vtkUser.memberships) {
    for (const permission of membership.group.permissions) {
      permissions.add(permission.permissionId);
    }
  }

  return {
    token: betterSession.session.token,
    expiresAt: betterSession.session.expiresAt.toISOString(),
    user: {
      id: vtkUser.id,
      email: vtkUser.email,
      name: vtkUser.name,
      avatarKey: vtkUser.avatarKey,
      locale: vtkUser.locale,
      isSuperAdmin: vtkUser.isSuperAdmin,
    },
    groups: vtkUser.memberships.map((membership) => ({
      id: membership.group.id,
      code: membership.group.code,
      slug: membership.group.slug,
      nameNl: membership.group.nameNl,
      nameEn: membership.group.nameEn,
      role: membership.role,
    })),
    permissions: Array.from(permissions).sort(),
  };
}

export async function requireSession(headers: Headers): Promise<SessionPayload> {
  const session = await getSession(headers);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  return session;
}

export async function requirePermission(
  headers: Headers,
  permission: string
): Promise<SessionPayload> {
  const session = await requireSession(headers);
  if (!session.user.isSuperAdmin && !session.permissions.includes(permission)) {
    throw new AuthError('FORBIDDEN');
  }
  return session;
}
