import "server-only";

import type { GoogleConfig } from "./config";
import { GoogleError, listChatMembers, type ChatMembership } from "./client";
import type { DirectoryAddresses } from "./aliases";
import { CHAT_ROLES, parseChatRole, type ChatRole } from "./chatRoles";

export { CHAT_ROLES, chatRoleLabel, parseChatRole, type ChatRole } from "./chatRoles";

/**
 * De leden van een chatruimte zoals het beheer ze toont: met naam en adres uit
 * de directory. Chat zelf geeft met beheerderstoegang enkel `users/{id}` en
 * `groups/{id}`; dat zijn de ids van de directory, dus die volstaat.
 */
export type ChatMemberView = {
  membershipName: string;
  kind: "user" | "group";
  email: string | null;
  name: string;
  role: ChatRole;
  invited: boolean;
  suspended: boolean;
};


export function memberView(membership: ChatMembership, directory: DirectoryAddresses | null): ChatMemberView {
  const ref = membership.groupMember?.name ?? membership.member?.name ?? "";
  const kind = membership.groupMember ? "group" : "user";
  const owner = directory?.byId.get(ref);
  return {
    membershipName: membership.name,
    kind,
    email: owner?.email ?? null,
    name: owner?.name ?? membership.member?.displayName ?? ref,
    role: parseChatRole(membership.role) ?? "ROLE_MEMBER",
    invited: membership.state === "INVITED",
    suspended: owner?.suspended ?? false,
  };
}

/** Eigenaars eerst, dan beheerders, dan de rest; binnen elke rol op naam. */
export async function chatMembersOf(
  cfg: GoogleConfig,
  spaceId: string,
  directory: DirectoryAddresses | null,
): Promise<ChatMemberView[]> {
  const memberships = await listChatMembers(cfg, spaceId);
  return memberships
    .map((membership) => memberView(membership, directory))
    .sort(
      (a, b) =>
        CHAT_ROLES.indexOf(a.role) - CHAT_ROLES.indexOf(b.role) ||
        Number(a.kind === "group") - Number(b.kind === "group") ||
        a.name.localeCompare(b.name, "nl-BE"),
    );
}

/**
 * Een fout van Chat als foutcode voor het scherm. Een ontbrekende delegatie
 * geeft bij het aanmelden een 401 (`unauthorized_client`), een API die niet
 * aanstaat of een Chat-app zonder configuratie een 403.
 */
export function chatErrorCode(err: unknown): string | null {
  if (!(err instanceof GoogleError)) return null;
  if (/unauthorized_client|Aanmelden bij Google/i.test(err.message)) return "CHAT_NOT_DELEGATED";
  if (err.status === 403) return "CHAT_FORBIDDEN";
  if (err.status === 409) return "NAME_TAKEN";
  if (err.status === 400) return "GOOGLE_REFUSED";
  if (err.status === 404) return "NOT_FOUND";
  return null;
}
