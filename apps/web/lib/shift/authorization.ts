import type { SessionPayload } from "@vtk/auth";

/**
 * Welke postcodes (Group.code) horen bij de praesidiumfuncties van deze gebruiker?
 */
export function userShiftPostCodes(session: SessionPayload): string[] {
  return session.groups.filter((g) => g.type === "PRAESIDIUM").map((g) => g.code);
}

/**
 * Is de gebruiker lid van de opgegeven praesidiumpost?
 */
export function isUserInShiftPost(
  session: SessionPayload,
  post: string | null | undefined,
): boolean {
  if (!post) return false;
  const userCodes = userShiftPostCodes(session);
  return userCodes.some((code) => code.toLowerCase() === post.toLowerCase());
}

/**
 * Mag deze gebruiker shiften beheren, voor minstens één post? Het recht achter
 * /admin/shiften en `/api/shift`; welke shiften precies, zegt `canManageShift`.
 */
export function canEditShifts(session: SessionPayload): boolean {
  return (
    session.user.isSuperAdmin ||
    session.permissions.includes("shift.edit") ||
    session.permissions.includes("shift.editAll")
  );
}

/**
 * Mag deze gebruiker de shiften van elke post beheren, en een shift zonder
 * post? Superadmin of `shift.editAll` (de rol `admin` draagt dat).
 */
export function canManageAllShifts(session: SessionPayload): boolean {
  return session.user.isSuperAdmin || session.permissions.includes("shift.editAll");
}

/**
 * Mag deze gebruiker deze shift aanpassen of verwijderen?
 *
 * - Superadmin of `shift.editAll`: alle shiften, ook die zonder post;
 * - Met `shift.edit`: enkel shiften van de eigen post(en). Een shift zonder post
 *   valt daar buiten;
 * - Zonder een van beide: geen enkele.
 */
export function canManageShift(
  session: SessionPayload,
  shift: { post: string | null },
): boolean {
  if (canManageAllShifts(session)) return true;
  if (!session.permissions.includes("shift.edit")) return false;
  return isUserInShiftPost(session, shift.post);
}
