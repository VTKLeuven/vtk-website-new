import "server-only";

import { prisma } from "@vtk/db";
import type { AuthGroupRole, Permission, SessionPayload } from "@vtk/auth";
import { WERKING_KINDS, type WerkingKind } from "@/lib/groupKinds";

/**
 * Wie de leden van een werkgroep of jaarwerking mag beheren zonder het brede
 * beheerrecht (`werkgroepen.manage`, `jaarwerkingen.manage`).
 *
 * Dat brede recht is niet geschikt voor de G3/G4 van een werkgroep: het geldt
 * voor elke werkgroep, en het rollenraster laat je ermee elke rol aan je
 * werkgroep hangen, ook `admin`. `werkgroepen.manageOwnMembers` telt daarom
 * enkel in de werkgroep die het je verleent: de rol moet aan díe werkgroep
 * hangen, en je lidmaatschap ervan moet die grant halen (DEFAULT voor elk lid,
 * LEADER enkel als je verantwoordelijke bent). Wie G3 is van Chemix en gewoon
 * lid van Revue, beheert dus enkel Chemix, ook al staat het recht in zijn
 * sessie. Een directe toekenning van het recht telt niet: zonder werkgroep heeft
 * het geen betekenis.
 *
 * Jaarwerkingen volgen exact dezelfde regel met hun eigen recht
 * (`jaarwerkingen.manageOwnMembers`). De twee lopen niet over in elkaar: het
 * recht van een werkgroep laat je geen jaarwerking beheren en omgekeerd.
 *
 * Bewust geen harde "enkel de verantwoordelijke": of het recht enkel bij de
 * G3/G4 hoort, zegt de soort grant, en die stelt IT per groep in.
 *
 * Werkt op `session.groups` en niet op een eigen lidmaatschapsquery, zodat het
 * ook in de autorisatievoorvertoning klopt.
 */
export const OWN_MEMBERS_PERMISSION = WERKING_KINDS.WERKGROEP.ownMembersPermission satisfies Permission;

type GrantKind = "DEFAULT" | "LEADER";

/** Haalt een lidmaatschap met deze rol een van deze grants binnen? */
export function grantReachesMember(kinds: readonly GrantKind[], role: AuthGroupRole): boolean {
  return kinds.some((kind) => kind === "DEFAULT" || role === "LEAD");
}

/**
 * De id's van de werkgroepen (of jaarwerkingen) waarvan deze sessie de gewone
 * leden mag beheren. Superadmins en houders van het brede beheerrecht vallen
 * hier niet onder: die beheren alles, en dat beslist de beller.
 */
export async function werkgroepenWithOwnMemberRights(
  session: SessionPayload,
  kind: WerkingKind = "WERKGROEP",
): Promise<Set<string>> {
  const permission = WERKING_KINDS[kind].ownMembersPermission;
  const own = session.groups.filter((group) => group.type === kind);
  if (own.length === 0 || !session.permissions.includes(permission)) return new Set();

  const grants = await prisma.groupRole.findMany({
    where: {
      groupId: { in: own.map((group) => group.id) },
      role: { permissions: { some: { permission: { code: permission } } } },
    },
    select: { groupId: true, kind: true },
  });

  const allowed = new Set<string>();
  for (const group of own) {
    const kinds = grants.filter((grant) => grant.groupId === group.id).map((grant) => grant.kind);
    if (grantReachesMember(kinds, group.role)) allowed.add(group.id);
  }
  return allowed;
}

export async function canManageOwnWerkgroepMembers(
  session: SessionPayload,
  groupId: string,
  kind: WerkingKind = "WERKGROEP",
): Promise<boolean> {
  return (await werkgroepenWithOwnMemberRights(session, kind)).has(groupId);
}
