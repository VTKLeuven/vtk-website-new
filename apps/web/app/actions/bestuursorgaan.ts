"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { normalizeKey, parseDriveId } from "@/lib/bo/names";
import { scanBestuursorgaan } from "@/lib/bo/scan";
import { getBoConfig, saveBoConfig } from "@/lib/bo/settings";
import { BO_VIEW_SCREEN, BO_VIEWS } from "@/lib/bo/views";

/*
 * Acties van /admin/bestuursorgaan. Elk ervan vraagt `bestuursorgaan.manage`
 * opnieuw: een server action is een gewoon POST-adres. Niets hiervan schrijft
 * naar Drive; de map blijft de bron.
 */

function revalidateBo() {
  revalidatePath("/[locale]/admin/bestuursorgaan", "page");
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** De BO-map nu lezen, in plaats van op de volgende ronde van de worker te wachten. */
export async function scanBestuursorgaanAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("bestuursorgaan.manage");
  const nl = formData.get("locale") !== "en";

  const outcome = await scanBestuursorgaan();
  revalidateBo();
  if ("skipped" in outcome) return saveError(outcome.skipped);
  const { status } = outcome;
  if (status.error) {
    return saveError(
      "SCAN_FAILED",
      nl ? `Lezen mislukt: ${status.error}` : `Reading failed: ${status.error}`,
    );
  }
  const meetings = status.years.reduce((sum, y) => sum + y.meetings, 0);
  const documents = status.years.reduce((sum, y) => sum + y.documents, 0);
  return saveOk(
    nl
      ? `${meetings} ${meetings === 1 ? "vergadering" : "vergaderingen"} en ${documents} ${documents === 1 ? "bestand" : "bestanden"} gelezen; ${status.read} ${status.read === 1 ? "rekenblad" : "rekenbladen"} opnieuw geopend.`
      : `Read ${meetings} meetings and ${documents} files; reopened ${status.read} spreadsheets.`,
  );
}

/** Waar de BO-map staat. */
export async function saveBoSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("bestuursorgaan.manage");

  const rootInput = field(formData, "root");
  const yearInput = field(formData, "yearFolder");
  const rootFolderId = rootInput ? parseDriveId(rootInput) : null;
  const yearFolderId = yearInput ? parseDriveId(yearInput) : null;
  if ((rootInput && !rootFolderId) || (yearInput && !yearFolderId)) return saveError("INVALID_LINK");
  if (!rootFolderId && !yearFolderId) return saveError("FOLDER_REQUIRED");

  const year = currentWorkingYear();
  const config = await getBoConfig();
  const yearFolderIds = { ...config.yearFolderIds };
  if (yearFolderId) yearFolderIds[String(year)] = yearFolderId;
  else delete yearFolderIds[String(year)];
  await saveBoConfig({ rootFolderId, yearFolderIds });

  await logAudit({
    action: "update",
    entity: "boSettings",
    target: "Bestuursorgaan",
    summary: yearFolderId
      ? `Map van het Bestuursorgaan ingesteld (${formatWorkingYear(year)} met de hand gekozen)`
      : "Map van het Bestuursorgaan ingesteld",
  });
  revalidateBo();
  return saveOk();
}

/** "Vice" is Groep 5: geldt voor elk bestand met die schrijfwijze. */
export async function saveBoPostAliasAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("bestuursorgaan.manage");

  const label = field(formData, "label");
  const key = normalizeKey(label);
  const groupId = field(formData, "groupId");
  if (!key) return saveError("INVALID_INPUT");
  if (!groupId) return saveError("GROUP_REQUIRED");
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { nameNl: true } });
  if (!group) return saveError("GROUP_REQUIRED");

  await prisma.boPostAlias.upsert({
    where: { key },
    create: { key, label, groupId },
    update: { groupId },
  });
  await logAudit({
    action: "update",
    entity: "boPostAlias",
    entityId: key,
    target: label,
    summary: `"${label}" in de BO-bestanden is ${group.nameNl}`,
  });
  revalidateBo();
  return saveOk();
}

export async function deleteBoPostAliasAction(formData: FormData): Promise<SaveState> {
  await requirePermission("bestuursorgaan.manage");
  const key = field(formData, "key");
  const alias = await prisma.boPostAlias.findUnique({ where: { key } });
  if (!alias) return saveError("ALIAS_NOT_FOUND");
  await prisma.boPostAlias.delete({ where: { key } });
  await logAudit({
    action: "delete",
    entity: "boPostAlias",
    entityId: key,
    target: alias.label,
    summary: `Koppeling van "${alias.label}" aan een post verwijderd`,
  });
  revalidateBo();
  return saveOk();
}

/**
 * Een resultaat met de hand bij een budget zetten. Staat hetzelfde bestand in
 * twee BO's, dan volgen beide rijen: het is één resultaat.
 */
export async function pairBoResultAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("bestuursorgaan.manage");

  const resultId = field(formData, "resultId");
  const budgetId = field(formData, "budgetId");
  const [result, budget] = await Promise.all([
    prisma.boDocument.findUnique({ where: { id: resultId }, select: { driveFileId: true, name: true } }),
    budgetId ? prisma.boDocument.findUnique({ where: { id: budgetId }, select: { name: true } }) : null,
  ]);
  if (!result) return saveError("DOCUMENT_NOT_FOUND");
  if (!budget) return saveError("BUDGET_REQUIRED");

  await prisma.boDocument.updateMany({
    where: { driveFileId: result.driveFileId },
    data: { pairedBudgetId: budgetId },
  });
  await logAudit({
    action: "update",
    entity: "boDocument",
    entityId: resultId,
    target: result.name,
    summary: `Resultaat bij budget ${budget.name} gezet`,
  });
  revalidateBo();
  return saveOk();
}

export async function unpairBoResultAction(formData: FormData): Promise<SaveState> {
  await requirePermission("bestuursorgaan.manage");

  const resultId = field(formData, "resultId");
  const result = await prisma.boDocument.findUnique({
    where: { id: resultId },
    select: { driveFileId: true, name: true },
  });
  if (!result) return saveError("DOCUMENT_NOT_FOUND");
  await prisma.boDocument.updateMany({
    where: { driveFileId: result.driveFileId },
    data: { pairedBudgetId: null },
  });
  await logAudit({
    action: "update",
    entity: "boDocument",
    entityId: resultId,
    target: result.name,
    summary: "Handmatige koppeling aan een budget ongedaan gemaakt",
  });
  revalidateBo();
  return saveOk();
}

/**
 * Welke weergave iemand verkiest: de verkenner of de lijst. Per account, zodat
 * ze op elk toestel dezelfde is. Geen toast bij succes: de weergave wisselt
 * zichtbaar, en dat is de bevestiging (zoals het speldje in de zijbalk).
 */
export async function saveBoViewAction(view: string): Promise<SaveState> {
  const session = await requirePermission("bestuursorgaan.manage");
  if (!(BO_VIEWS as readonly string[]).includes(view)) return saveError("INVALID_INPUT");
  await prisma.userViewPreference.upsert({
    where: { userId_screen: { userId: session.user.id, screen: BO_VIEW_SCREEN } },
    create: { userId: session.user.id, screen: BO_VIEW_SCREEN, view },
    update: { view },
  });
  return saveOk();
}
