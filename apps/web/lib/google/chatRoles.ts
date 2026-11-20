/**
 * De rollen in een chatruimte, in de woorden van Chat zelf. Los van
 * `chatSpaces.ts` (server-only), zodat het formulier ze ook kan lezen.
 */
export type ChatRole = "ROLE_MEMBER" | "ROLE_ASSISTANT_MANAGER" | "ROLE_MANAGER";

export const CHAT_ROLES: readonly ChatRole[] = ["ROLE_MANAGER", "ROLE_ASSISTANT_MANAGER", "ROLE_MEMBER"];

/** Eigenaar (`ROLE_MANAGER`), beheerder (`ROLE_ASSISTANT_MANAGER`), lid. */
export function chatRoleLabel(role: ChatRole, nl: boolean): string {
  if (role === "ROLE_MANAGER") return nl ? "Eigenaar" : "Owner";
  if (role === "ROLE_ASSISTANT_MANAGER") return nl ? "Beheerder" : "Manager";
  return nl ? "Lid" : "Member";
}

export function parseChatRole(value: string | null | undefined): ChatRole | null {
  return CHAT_ROLES.find((role) => role === value) ?? null;
}
