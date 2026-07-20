/**
 * Permissie-registry, gedeeld over alle apps.
 *
 * De canonieke lijst leeft in `@vtk/db/permissions` (een zuivere data-module
 * zonder Prisma-import, zodat ze veilig in client- én serverbundels belandt en
 * de seed ze kan gebruiken). @vtk/auth her-exporteert ze samen met het
 * `Permission`-type en enkele helpers, zodat consumenten alles via @vtk/auth
 * importeren.
 *
 * Een nieuwe permissie toevoegen: voeg één regel toe aan
 * `packages/db/src/permissions.ts`. Het `Permission`-type, de admin-selector en
 * `requirePermission` volgen automatisch. Zie `docs/permissions.md`.
 */
import { PERMISSIONS, type PermissionCode } from '@vtk/db/permissions';

export { PERMISSIONS };

/** Union van alle geldige permissiecodes (bv. `'users.view'`). */
export type Permission = PermissionCode;

const PERMISSION_CODES = new Set<string>(PERMISSIONS.map((p) => p.code));

/** Type-guard: is `value` een bekende permissiecode? */
export function isPermission(value: string): value is Permission {
  return PERMISSION_CODES.has(value);
}

/** Alle permissiecodes als array (bv. om een selector te bouwen). */
export function permissionCodes(): Permission[] {
  return PERMISSIONS.map((p) => p.code);
}
