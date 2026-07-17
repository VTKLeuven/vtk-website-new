import { hasPermission, type SessionPayload } from "@vtk/auth";
import { currentWorkingYear, workingYearStart } from "@/lib/workingYear";

/**
 * Mag deze gebruiker de INHOUD van deze pagina bewerken?
 *
 * - superadmin of `pages.editAll`: altijd;
 * - `pages.edit`: enkel wanneer de pagina een rol heeft die de gebruiker dit
 *   werkingsjaar draagt (PageEditorRole);
 * - een pagina zonder rollen is vergrendeld voor gewone pages.edit-houders.
 *
 * Dit gaat enkel over de inhoud (de editor onder /admin/paginas). Structuur en
 * metadata (slug, categorie, rollen, publicatie) vallen onder `pages.manage`.
 */
export function canEditPageContent(
  session: SessionPayload,
  page: { editorRoles: { roleId: string }[] },
): boolean {
  if (session.user.isSuperAdmin || hasPermission(session, "pages.editAll")) return true;
  if (!hasPermission(session, "pages.edit")) return false;
  return page.editorRoles.some((r) => session.roleIds.includes(r.roleId));
}

/**
 * Mag deze gebruiker pagina's publiceren (of depubliceren)?
 *
 * Publiceren is een apart recht van bewerken: schrijven aan een pagina betekent
 * niet dat je ze ook op de site mag zetten. `pages.manage` zit erbij omdat dat
 * scherm de publicatie altijd al beheerde.
 */
export function canPublishPages(session: SessionPayload): boolean {
  return (
    session.user.isSuperAdmin ||
    hasPermission(session, "pages.publish") ||
    hasPermission(session, "pages.manage")
  );
}

/**
 * Zou de gebruiker met deze nieuwe set bewerkrollen zijn eigen toegang tot de
 * pagina kwijtspelen? Zo ja, vraagt de editor een extra bevestiging voor hij
 * opslaat (en stuurt hij daarna terug naar het overzicht).
 *
 * Spiegelt bewust de regel uit {@link canEditPageContent}: enkel een gewone
 * `pages.edit`-bewerker kan zich buitensluiten, want editAll en superadmins
 * komen er sowieso nog bij.
 */
export function losesOwnPageAccess(opts: {
  canEditAll: boolean;
  /** Rollen die de gebruiker dit werkingsjaar draagt. */
  myRoleIds: string[];
  /** De bewerkrollen zoals ze na het opslaan zouden zijn. */
  nextRoleIds: string[];
}): boolean {
  if (opts.canEditAll) return false;
  return !opts.nextRoleIds.some((id) => opts.myRoleIds.includes(id));
}

/**
 * Moet deze pagina dit werkingsjaar nog nagekeken worden? Enkel relevant voor
 * pagina's met `needsYearlyEdit`: waar tot de inhoud sinds de start van het
 * huidige werkingsjaar (15 juli) niet meer opgeslagen is.
 */
export function needsYearlyReview(page: {
  needsYearlyEdit: boolean;
  contentEditedAt: Date | null;
}): boolean {
  if (!page.needsYearlyEdit) return false;
  const start = workingYearStart(currentWorkingYear());
  return page.contentEditedAt === null || page.contentEditedAt < start;
}
