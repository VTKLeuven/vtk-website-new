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
