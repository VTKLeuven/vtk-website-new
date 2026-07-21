import "server-only";

import type { AuthGroupRole, SessionPayload } from "@vtk/auth";
import { prisma } from "@vtk/db";
export {
  AUTHORIZATION_PREVIEW_COOKIE,
  AUTHORIZATION_PREVIEW_MAX_AGE,
} from "@/lib/authorization-preview-constants";
import type { AuthorizationPreviewSelection } from "@/lib/authorization-preview-selection";
export {
  decodeAuthorizationPreview,
  encodeAuthorizationPreview,
  type AuthorizationPreviewSelection,
} from "@/lib/authorization-preview-selection";

export type AuthorizationPreview = {
  roles: Array<{ id: string; nameNl: string; nameEn: string }>;
  groups: Array<{
    id: string;
    nameNl: string;
    nameEn: string;
    role: AuthGroupRole;
  }>;
};

type RoleRecord = {
  id: string;
  nameNl: string;
  nameEn: string;
  permissions: Array<{ permission: { code: string } }>;
};

/**
 * Resolves a synthetic authorization context without ever loading another
 * person's account. Identity and personal fields stay those of the real IT
 * admin; only roles, post memberships and their derived permissions change.
 */
export async function resolveAuthorizationPreview(
  actualSession: SessionPayload,
  selection: AuthorizationPreviewSelection,
): Promise<{ session: SessionPayload; preview: AuthorizationPreview } | null> {
  if (!actualSession.user.isSuperAdmin || selection.actorId !== actualSession.user.id) return null;

  const selectedGroupRole = new Map(selection.groups.map((group) => [group.id, group.role]));
  const [directRoles, groups] = await Promise.all([
    prisma.role.findMany({
      where: { id: { in: selection.roleIds } },
      select: {
        id: true,
        nameNl: true,
        nameEn: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    }),
    prisma.group.findMany({
      where: { id: { in: selection.groups.map((group) => group.id) }, active: true },
      select: {
        id: true,
        code: true,
        slug: true,
        nameNl: true,
        nameEn: true,
        roleGrants: {
          select: {
            kind: true,
            role: {
              select: {
                id: true,
                nameNl: true,
                nameEn: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const effectiveRoles = new Map<string, RoleRecord>();
  for (const role of directRoles) effectiveRoles.set(role.id, role);
  for (const group of groups) {
    const membershipRole = selectedGroupRole.get(group.id);
    for (const grant of group.roleGrants) {
      if (grant.kind === "LEADER" && membershipRole !== "LEAD") continue;
      effectiveRoles.set(grant.role.id, grant.role);
    }
  }

  const permissions = new Set<string>();
  for (const role of effectiveRoles.values()) {
    for (const grant of role.permissions) permissions.add(grant.permission.code);
  }

  return {
    session: {
      ...actualSession,
      // A preview must never inherit the superadmin bypass. Its effective
      // access consists exclusively of the selected roles and posts.
      user: { ...actualSession.user, isSuperAdmin: false },
      groups: groups.map((group) => ({
        id: group.id,
        code: group.code,
        slug: group.slug,
        nameNl: group.nameNl,
        nameEn: group.nameEn,
        role: selectedGroupRole.get(group.id) ?? "MEMBER",
      })),
      permissions: [...permissions],
      roleIds: [...effectiveRoles.keys()],
    },
    preview: {
      roles: directRoles.map((role) => ({
        id: role.id,
        nameNl: role.nameNl,
        nameEn: role.nameEn,
      })),
      groups: groups.map((group) => ({
        id: group.id,
        nameNl: group.nameNl,
        nameEn: group.nameEn,
        role: selectedGroupRole.get(group.id) ?? "MEMBER",
      })),
    },
  };
}
