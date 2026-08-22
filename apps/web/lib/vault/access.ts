import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { SessionPayload } from "@vtk/auth";

/**
 * Wie welke postkluis mag zien.
 *
 * Het uitgangspunt is dat je de wachtwoorden van je eigen post beheert; een
 * kluis is geen IT-bezit maar postbezit. `vault.manage` is de uitzondering voor
 * IT, die alle gekoppelde posten ziet om te kunnen helpen.
 *
 * De lijst komt altijd uit `GroupMembership` van het **huidige werkingsjaar**,
 * nooit uit een ooit-lidmaatschap: anders zou iemand na de wissel op 15 juli in
 * de admin nog wachtwoorden zien van een post die hij niet meer heeft, ook al is
 * zijn toegang in de kluis zelf al weg.
 */

export type VaultPostAccess = {
  vaultPostId: string;
  groupId: string;
  groupName: string;
  collectionId: string | null;
  enabled: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
};

function canManageAll(session: SessionPayload): boolean {
  return session.user.isSuperAdmin || session.permissions.includes("vault.manage");
}

/** De posten waarvan deze gebruiker de wachtwoorden mag beheren. */
export async function vaultPostsForSession(
  session: SessionPayload,
): Promise<VaultPostAccess[]> {
  const all = canManageAll(session);
  const mayEditOwn = all || session.permissions.includes("vault.editOwn");
  if (!mayEditOwn) return [];

  const rows = await prisma.vaultPost.findMany({
    where: {
      enabled: true,
      ...(all
        ? {}
        : {
            group: {
              memberships: { some: { userId: session.user.id, year: currentWorkingYear() } },
            },
          }),
    },
    select: {
      id: true,
      groupId: true,
      collectionId: true,
      enabled: true,
      lastSyncAt: true,
      lastError: true,
      group: { select: { nameNl: true } },
    },
    orderBy: { group: { nameNl: "asc" } },
  });

  return rows.map((r) => ({
    vaultPostId: r.id,
    groupId: r.groupId,
    groupName: r.group.nameNl,
    collectionId: r.collectionId,
    enabled: r.enabled,
    lastSyncAt: r.lastSyncAt,
    lastError: r.lastError,
  }));
}

/**
 * Dezelfde controle, maar voor één post en met de collection erbij. Server
 * actions gebruiken dit: zij mogen niet vertrouwen op wat de client meestuurt,
 * dus elke actie zoekt de post hier opnieuw op in plaats van een `collectionId`
 * uit het formulier over te nemen.
 */
export async function requireVaultPost(
  session: SessionPayload,
  vaultPostId: string,
): Promise<VaultPostAccess & { collectionId: string }> {
  const posts = await vaultPostsForSession(session);
  const post = posts.find((p) => p.vaultPostId === vaultPostId);
  if (!post) throw new Error("FORBIDDEN");
  if (!post.collectionId) throw new Error("NOT_SYNCED");
  return { ...post, collectionId: post.collectionId };
}
