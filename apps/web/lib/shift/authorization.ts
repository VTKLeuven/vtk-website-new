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
 * Mag deze gebruiker deze shift aanpassen of verwijderen?
 *
 * - Superadmin: mag alle shiften bewerken/verwijderen;
 * - Zonder `shift.edit`: mag geen shiften bewerken/verwijderen;
 * - Met `shift.edit`: mag enkel shiften van de eigen post(en) bewerken/verwijderen.
 *   Een shift zonder post kan enkel door een superadmin worden beheerd.
 */
export function canManageShift(
  session: SessionPayload,
  shift: { post: string | null },
): boolean {
  if (session.user.isSuperAdmin) return true;
  if (!session.permissions.includes("shift.edit")) return false;
  return isUserInShiftPost(session, shift.post);
}
