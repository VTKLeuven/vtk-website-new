import "server-only";

import { prisma } from "@vtk/db";
import type { AuthGroupRole, Permission, SessionPayload } from "@vtk/auth";

/**
 * Wie de leden van een werkgroep mag beheren zonder `werkgroepen.manage`.
 *
 * Dat brede recht is niet geschikt voor de G3/G4 van een werkgroep: het geldt
 * voor elke werkgroep, en `setWerkgroepRoleAction` laat je ermee elke rol aan je
 * werkgroep hangen, ook `admin`. `werkgroepen.manageOwnMembers` telt daarom
 * enkel in de werkgroep die het je verleent: de rol moet aan díe werkgroep
 * hangen, en je lidmaatschap ervan moet die grant halen (DEFAULT voor elk lid,
 * LEADER enkel als je verantwoordelijke bent). Wie G3 is van Chemix en gewoon
 * lid van Revue, beheert dus enkel Chemix, ook al staat het recht in zijn
 * sessie. Een directe toekenning van het recht telt niet: zonder werkgroep heeft
 * het geen betekenis.
 *
 * Bewust geen harde "enkel de verantwoordelijke": of het recht enkel bij de
 * G3/G4 hoort, zegt de soort grant, en die stelt IT per werkgroep in.
 *
 * Werkt op `session.groups` en niet op een eigen lidmaatschapsquery, zodat het
 * ook in de autorisatievoorvertoning klopt.
 */
export const OWN_MEMBERS_PERMISSION = "werkgroepen.manageOwnMembers" satisfies Permission;

type GrantKind = "DEFAULT" | "LEADER";

/** Haalt een lidmaatschap met deze rol een van deze grants binnen? */
export function grantReachesMember(kinds: readonly GrantKind[], role: AuthGroupRole): boolean {
  return kinds.some((kind) => kind === "DEFAULT" || role === "LEAD");
}

/**
 * De id's van de werkgroepen waarvan deze sessie de gewone leden mag beheren.
 * Superadmins en houders van `werkgroepen.manage` vallen hier niet onder: die
 * beheren alles, en dat beslist de beller.
 */
export async function werkgroepenWithOwnMemberRights(session: SessionPayload): Promise<Set<string>> {
  const own = session.groups.filter((group) => group.type === "WERKGROEP");
  if (own.length === 0 || !session.permissions.includes(OWN_MEMBERS_PERMISSION)) return new Set();

  const grants = await prisma.groupRole.findMany({
    where: {
      groupId: { in: own.map((group) => group.id) },
      role: { permissions: { some: { permission: { code: OWN_MEMBERS_PERMISSION } } } },
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
): Promise<boolean> {
  return (await werkgroepenWithOwnMemberRights(session)).has(groupId);
}
