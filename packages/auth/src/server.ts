import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@vtk/db";
import { randomBytes } from "node:crypto";
import { SESSION_DURATION_MS, type SessionPayload } from "./index";

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(params: {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({
    data: {
      token,
      userId: params.userId,
      expiresAt,
      userAgent: params.userAgent ?? null,
      ip: params.ip ?? null,
    },
  });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSessionByToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              group: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row || row.expiresAt <= new Date() || !row.user.active) return null;

  const permissions = new Set<string>();
  const groups: SessionPayload["groups"] = [];
  for (const m of row.user.memberships) {
    groups.push({
      id: m.group.id,
      code: m.group.code,
      slug: m.group.slug,
      nameNl: m.group.nameNl,
      nameEn: m.group.nameEn,
      role: m.role,
    });
    for (const gp of m.group.permissions) {
      permissions.add(gp.permission.code);
    }
  }

  return {
    token: row.token,
    expiresAt: row.expiresAt.toISOString(),
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      avatarKey: row.user.avatarKey,
      locale: row.user.locale,
      isSuperAdmin: row.user.isSuperAdmin,
    },
    groups,
    permissions: Array.from(permissions),
  };
}
