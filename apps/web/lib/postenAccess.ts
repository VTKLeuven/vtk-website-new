import "server-only";
import { prisma } from "@vtk/db";
import { hasPermission, type SessionPayload } from "@vtk/auth";
import { werkgroepenWithOwnMemberRights } from "@/lib/werkgroepMembers";

/**
 * Welke tabbladen van "Posten & werkgroepen" iemand mag openen. Eén bron voor de
 * zijbalk (die het item toont zodra er één tabblad is), de kop van de module en
 * de doorverwijzing vanaf /admin/groepen; elke pagina controleert haar eigen
 * recht daarnaast nog eens.
 *
 * - Posten: `groups.manage`.
 * - Werkgroepen: `werkgroepen.manage`, of lid van een werkgroep (die bewerkt
 *   enkel de infotekst van zijn eigen werkgroep).
 * - Jaarwerkingen: `jaarwerkingen.manage`, of de verantwoordelijke die de leden
 *   van zijn eigen jaarwerking beheert. Een gewoon lid heeft er niets te doen.
 * - Kiesploeg: `kiesploeg.manage`.
 */
export type PostenAccess = {
  posts: boolean;
  werkgroepen: boolean;
  jaarwerkingen: boolean;
  kiesploeg: boolean;
};

export async function postenAccess(session: SessionPayload | null | undefined): Promise<PostenAccess> {
  if (!session) return { posts: false, werkgroepen: false, jaarwerkingen: false, kiesploeg: false };
  if (session.user.isSuperAdmin) return { posts: true, werkgroepen: true, jaarwerkingen: true, kiesploeg: true };

  const werkgroepen =
    hasPermission(session, "werkgroepen.manage") ||
    (session.groups.length > 0 &&
      (await prisma.group.count({
        where: { type: "WERKGROEP", id: { in: session.groups.map((g) => g.id) } },
      })) > 0);
  const jaarwerkingen =
    hasPermission(session, "jaarwerkingen.manage") ||
    (await werkgroepenWithOwnMemberRights(session, "JAARWERKING")).size > 0;

  return {
    posts: hasPermission(session, "groups.manage"),
    werkgroepen,
    jaarwerkingen,
    kiesploeg: hasPermission(session, "kiesploeg.manage"),
  };
}

/** Het eerste tabblad dat iemand mag openen, als pad onder /admin; null als geen. */
export function firstPostenTab(access: PostenAccess): string | null {
  if (access.posts) return "/groepen";
  if (access.werkgroepen) return "/werkgroepen";
  if (access.jaarwerkingen) return "/jaarwerkingen";
  if (access.kiesploeg) return "/kiesploeg";
  return null;
}
