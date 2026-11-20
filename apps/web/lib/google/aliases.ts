import "server-only";

import { prisma } from "@vtk/db";
import type { GoogleConfig } from "./config";
import { listGroups, listMembers } from "./client";
import { cachedDirectory } from "./directoryCache";
import { kiesploegAlias } from "./sync";
import { expandRecipients, type Expansion } from "./recipients";

/**
 * De adressen van het domein zoals het tabblad Aliassen ze toont: elke groep en
 * elk account met hun aliassen, en per alias van wie hij is.
 *
 * Groepen worden bij elke lezing opgehaald (een paar aanroepen), accounts uit
 * de cache van vijf minuten (`cachedDirectory`), die na elke wijziging hier
 * vergeten wordt.
 */

export type AddressOwner = {
  kind: "group" | "user";
  /** Het id in de directory; Chat noemt een lid `users/{id}` of `groups/{id}`. */
  id: string;
  email: string;
  name: string;
  aliases: string[];
  suspended: boolean;
  /** Een groep met een `MailGroup`-rij: de site beheert haar leden. */
  managedBySite: boolean;
};

export type AliasRow = {
  alias: string;
  owner: AddressOwner;
  /**
   * Een kiesploegadres dat de sync zelf zet en op 15 juli weghaalt. Wie het
   * hier wijzigt, botst met de sync; het scherm zegt dat erbij.
   */
  kiesploeg: boolean;
};

export type DirectoryAddresses = {
  owners: AddressOwner[];
  aliases: AliasRow[];
  /** Elk adres (hoofdadres en alias) in kleine letters, naar zijn eigenaar. */
  byAddress: Map<string, AddressOwner>;
  /** `users/{id}` en `groups/{id}`, zoals Chat een lid noemt, naar zijn eigenaar. */
  byId: Map<string, AddressOwner>;
};

async function activeKiesploegAliases(domain: string): Promise<Set<string>> {
  const members = await prisma.kiesploegMember.findMany({
    where: { aliasRemovedAt: null, kiesploeg: { active: true } },
    select: {
      aliasEmail: true,
      kiesploeg: { select: { code: true, aliasTemplate: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
  const out = new Set<string>();
  for (const member of members) {
    const alias = kiesploegAlias(member, member.user, domain);
    if (alias) out.add(alias.toLowerCase());
  }
  return out;
}

export async function directoryAddresses(cfg: GoogleConfig): Promise<DirectoryAddresses> {
  const [groups, users, mailGroups, kiesploeg] = await Promise.all([
    listGroups(cfg),
    cachedDirectory(cfg),
    prisma.mailGroup.findMany({ select: { email: true } }),
    activeKiesploegAliases(cfg.domain),
  ]);
  const managed = new Set(mailGroups.map((group) => group.email.toLowerCase()));

  const owners: AddressOwner[] = [
    ...groups.map((group) => ({
      kind: "group" as const,
      id: group.id,
      email: group.email,
      name: group.name,
      aliases: group.aliases ?? [],
      suspended: false,
      managedBySite: managed.has(group.email.toLowerCase()),
    })),
    ...users.map((user) => ({
      kind: "user" as const,
      id: user.id,
      email: user.primaryEmail,
      name: user.name?.fullName ?? user.primaryEmail,
      aliases: user.aliases ?? [],
      suspended: Boolean(user.suspended),
      managedBySite: false,
    })),
  ];

  const byAddress = new Map<string, AddressOwner>();
  const byId = new Map<string, AddressOwner>();
  const aliases: AliasRow[] = [];
  for (const owner of owners) {
    byId.set(`${owner.kind === "group" ? "groups" : "users"}/${owner.id}`, owner);
    byAddress.set(owner.email.toLowerCase(), owner);
    for (const alias of owner.aliases) {
      byAddress.set(alias.toLowerCase(), owner);
      aliases.push({ alias, owner, kiesploeg: owner.kind === "user" && kiesploeg.has(alias.toLowerCase()) });
    }
  }
  aliases.sort((a, b) => a.alias.localeCompare(b.alias));
  owners.sort((a, b) => a.email.localeCompare(b.email));
  return { owners, aliases, byAddress, byId };
}

/**
 * Wie een mail naar dit adres krijgt. Een account is zijn eigen postbus; een
 * groep klappen we recursief uit (`expandRecipients`). Leden die Google niet
 * kan tonen (een groep buiten het domein, geen rechten), staan als onleesbaar
 * in de boom in plaats van het hele scherm te laten falen.
 */
export async function recipientsOf(
  cfg: GoogleConfig,
  owner: AddressOwner,
): Promise<Expansion | null> {
  if (owner.kind === "user") return null;
  return expandRecipients(owner.email, async (groupEmail) => {
    try {
      const members = await listMembers(cfg, groupEmail);
      return members.map((member) => ({
        email: member.email,
        type: member.type,
        role: member.role,
        status: member.status,
      }));
    } catch {
      return null;
    }
  });
}
