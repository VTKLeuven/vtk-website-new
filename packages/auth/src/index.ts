export const SESSION_COOKIE_NAME = "vtk_session";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarKey: string | null;
  locale: "NL" | "EN";
  isSuperAdmin: boolean;
};

export type AuthGroup = {
  id: string;
  code: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  role: "MEMBER" | "LEAD";
};

export type SessionPayload = {
  token: string;
  expiresAt: string;
  user: AuthUser;
  groups: AuthGroup[];
  permissions: string[];
};

export function hasPermission(
  session: SessionPayload | null | undefined,
  code: string,
  options?: { groupId?: string }
): boolean {
  if (!session) return false;
  if (session.user.isSuperAdmin) return true;
  if (!session.permissions.includes(code)) return false;
  if (options?.groupId) {
    return session.groups.some((g) => g.id === options.groupId);
  }
  return true;
}

export function isMemberOfGroup(
  session: SessionPayload | null | undefined,
  groupCode: string
): boolean {
  if (!session) return false;
  return session.groups.some((g) => g.code === groupCode);
}

export function cookieDomain(): string | undefined {
  return process.env.SESSION_COOKIE_DOMAIN || undefined;
}
