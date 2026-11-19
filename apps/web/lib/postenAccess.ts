import "server-only";
import { hasPermission, type SessionPayload } from "@vtk/auth";
import { werkgroepenWithInfoRights, werkgroepenWithOwnMemberRights } from "@/lib/werkgroepMembers";

/**
 * Welke tabbladen van "Posten & werkgroepen" iemand mag openen. Eén bron voor de
 * zijbalk (die het item toont zodra er één tabblad is), de kop van de module en
 * de doorverwijzing vanaf /admin/groepen; elke pagina controleert haar eigen
 * recht daarnaast nog eens.
 *
 * - Posten: `groups.manage`.
 * - Werkgroepen: `werkgroepen.manage`, of wie via zijn werkgroep de infotekst
 *   (`werkgroepen.editOwnInfo`) of de gewone leden
 *   (`werkgroepen.manageOwnMembers`) van die werkgroep beheert: in productie de
 *   G3/G4. Een gewoon lid heeft er niets te doen en ziet het tabblad niet.
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
    (await werkgroepenWithInfoRights(session)).size > 0 ||
    (await werkgroepenWithOwnMemberRights(session, "WERKGROEP")).size > 0;
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
