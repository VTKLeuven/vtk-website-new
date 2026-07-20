/**
 * @author Witse Panneels
 * @date 2026-06-25
 *
 * auth types and basic helper functions
 * Safe to use in browser and server components :))
 */
import type { NextRequest } from 'next/server';
import type { Permission } from './lib/permissions';

export { splitFullName, fullName, nameParts, type NameParts } from './lib/names';
export { PERMISSIONS, isPermission, permissionCodes, type Permission } from './lib/permissions';
export { currentWorkingYear, FIRST_WORKING_YEAR } from './lib/workingYear';

/** */
export type Locale = 'NL' | 'EN';
export type AuthGroupRole = 'MEMBER' | 'LEAD';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarKey: string | null;
  locale: Locale;
  isSuperAdmin: boolean;
  /** `false` until the member completes the onboarding profile. */
  onboarded: boolean;
  /**
   * Werkingsjaar waarin het studieprofiel laatst bevestigd werd, of `null`.
   * Bewust de ruwe waarde en geen `studyConfirmed`-boolean: welk werkingsjaar
   * "nu" is, hangt af van de cutover-logica in de app (`lib/workingYear.ts`),
   * die hier niet thuishoort.
   */
  studyConfirmedYear: number | null;
};

export type AuthGroup = {
  id: string;
  code: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  role: AuthGroupRole;
};

// ==============================
// Sessions
// ==============================

export type SessionPayload = {
  token: string;
  expiresAt: string;
  user: AuthUser;
  groups: AuthGroup[];
  permissions: string[];
  /**
   * Rol-id's van de gebruiker voor het huidige werkingsjaar (direct toegewezen
   * plus via posten, zelfde resolutie als `permissions`). Gebruikt voor checks
   * die aan een specifieke rol hangen, zoals paginabewerking (PageEditorRole).
   */
  roleIds: string[];
};

export function hasPermission(
  session: SessionPayload | null | undefined,
  code: Permission,
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

export function hasAnyPermission(
  session: SessionPayload | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(session, permission));
}

export function hasAllPermissions(
  session: SessionPayload | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(session, permission));
}

export function isMemberOfGroup(
  session: SessionPayload | null | undefined,
  groupCode: string
): boolean {
  if (!session) return false;
  return session.groups.some((g) => g.code === groupCode);
}

// ==============================
// Error types
// ==============================

export type AuthErrorCode =
  'UNAUTHENTICATED' | 'FORBIDDEN' | 'INACTIVE_USER' | 'INVALID_INPUT' | 'REMOTE_AUTH_UNAVAILABLE';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message = code
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ==============================
// Api endpoints
// ==============================
export type RouteContext = {
  params: Promise<{
    all?: string[];
  }>;
};

export type RouteHandler = (
  request: NextRequest,
  context: RouteContext
) => Promise<Response> | Response;

export type ApiHandlers = {
  GET: RouteHandler;
  POST: RouteHandler;
  PATCH: RouteHandler;
  PUT: RouteHandler;
  DELETE: RouteHandler;
};
