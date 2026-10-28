"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { monthToDate, parseMonth } from "@/lib/inkomsten/parse";
import {
  assignUnassignedGroup,
  importIncomeExport,
  listClosedPeriods,
  lockedMonthTest,
  rematchOpenTransactions,
  resetManualAssignment,
  saveIncomeConfig,
  setPayoutCheck,
  type ImportSummary,
} from "@/lib/inkomsten/server";

/** Foutcodes die /admin/inkomsten zelf vertaalt (`messages.ts`). */
export type IncomeErrorCode =
  | "NO_FILE"
  | "FILE_TOO_LARGE"
  | "EMPTY"
  | "UNKNOWN_FORMAT"
  | "MOLLIE_BALANCE"
  | "NOT_YET_SUPPORTED"
  | "BAD_ROW"
  | "NOT_FOUND"
  | "CODE_NOT_FOUND"
  | "CODE_REQUIRED"
  | "CANNOT_REMEMBER"
  | "LOCKED"
  | "BAD_PERIOD"
  | "PERIOD_OVERLAP"
  | "BAD_DATE"
  | "ACCOUNT_REQUIRED";

/** "1 transactie", "3 transacties". */
function transactions(count: number): string {
  return `${count} ${count === 1 ? "transactie" : "transacties"}`;
}

/** Een export van een kwartaal is een paar honderd kilobyte; dit laat ruim marge. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function revalidate(): void {
  revalidatePath("/admin/inkomsten", "layout");
}

async function readFile(formData: FormData): Promise<{ text: string; name: string } | { error: IncomeErrorCode }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_FILE_BYTES) return { error: "FILE_TOO_LARGE" };
  return { text: await file.text(), name: file.name };
}

// -----------------------------------------------------------------------------
// Opladen
// -----------------------------------------------------------------------------

export type ImportPreviewState =
  | { status: "idle" }
  | { status: "preview"; summary: ImportSummary }
  | { status: "error"; code: IncomeErrorCode; detail?: string };

/** Lees het bestand en zeg wat opladen zou doen, zonder iets te bewaren. */
export async function previewIncomeImportAction(formData: FormData): Promise<ImportPreviewState> {
  await requirePermission("income.manage");
  const file = await readFile(formData);
  if ("error" in file) return { status: "error", code: file.error };
  const outcome = await importIncomeExport(file.text, file.name, { dryRun: true, userId: null });
  if (!outcome.ok) return { status: "error", code: outcome.error, detail: outcome.detail };
  return { status: "preview", summary: outcome.summary };
}

export async function importIncomeAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const file = await readFile(formData);
  if ("error" in file) return saveError(file.error);
  const outcome = await importIncomeExport(file.text, file.name, { dryRun: false, userId: session.user.id });
  if (!outcome.ok) return saveError(outcome.error, outcome.detail ? `Regel niet te lezen (${outcome.detail}).` : undefined);

  const { summary } = outcome;
  const open = summary.rules.OPEN;
  await logAudit({
    action: "import",
    entity: "incomeImport",
    entityId: outcome.importId ?? undefined,
    target: summary.fileName,
    summary: `${summary.created} nieuw, ${summary.duplicates} al gekend, ${open} na te kijken`,
  });
  revalidate();
  const parts = [`${transactions(summary.created)} nieuw`];
  if (summary.duplicates) parts.push(`${summary.duplicates} al gekend`);
  if (summary.updated) parts.push(`${summary.updated} nu uitbetaald`);
  if (open) parts.push(`${open} na te kijken`);
  return saveOk(`Opgeladen: ${parts.join(", ")}.`);
}

/** Een import wegdoen, met alles wat ze aanmaakte. Niet in een afgesloten periode. */
export async function deleteIncomeImportAction(formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const found = await prisma.incomeImport.findUnique({ where: { id }, select: { id: true, fileName: true, createdCount: true } });
  if (!found) return saveError("NOT_FOUND");

  const isLocked = lockedMonthTest(await listClosedPeriods());
  const months = await prisma.incomeTransaction.findMany({
    where: { importId: id, periodMonth: { not: null } },
    distinct: ["periodMonth"],
    select: { periodMonth: true },
  });
  if (months.some((row) => isLocked(row.periodMonth!.toISOString().slice(0, 7)))) return saveError("LOCKED");

  await prisma.incomeImport.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "incomeImport",
    entityId: id,
    target: found.fileName,
    summary: `${found.createdCount} transacties weg`,
  });
  revalidate();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Na te kijken
// -----------------------------------------------------------------------------

export async function assignIncomeGroupAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const key = String(formData.get("key") ?? "");
  const exclude = formData.get("intent") === "exclude";
  const accountingCodeId = String(formData.get("accountingCodeId") ?? "");
  const remember = formData.get("remember") === "on";
  if (!exclude && !accountingCodeId) return saveError("CODE_REQUIRED");

  const outcome = await assignUnassignedGroup(
    key,
    exclude ? { exclude: true } : { accountingCodeId, remember },
    session.user.id,
  );
  if (!outcome.ok) return saveError(outcome.error);

  await logAudit({
    action: "update",
    entity: "incomeTransaction",
    target: key.split("|").map(decodeURIComponent).slice(2).filter(Boolean).join(" · ") || key,
    summary: exclude
      ? `${transactions(outcome.count)}: telt niet mee`
      : `${transactions(outcome.count)} toegewezen${remember ? ", tekst onthouden" : ""}`,
  });
  revalidate();
  return saveOk(
    exclude
      ? `${transactions(outcome.count)}: telt niet mee.`
      : `${transactions(outcome.count)} toegewezen${remember ? "; de tekst is onthouden" : ""}.`,
  );
}

export async function resetIncomeAssignmentAction(formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const result = await resetManualAssignment(id);
  if (result !== "OK") return saveError(result);
  await logAudit({ action: "update", entity: "incomeTransaction", entityId: id, target: id, summary: "toewijzing met de hand gewist" });
  revalidate();
  return saveOk();
}

export async function rematchIncomeAction(): Promise<SaveState> {
  await requirePermission("income.manage");
  const changed = await rematchOpenTransactions();
  revalidate();
  return saveOk(changed ? `${changed} koppelingen bijgewerkt.` : "Alles stond al juist.");
}

// -----------------------------------------------------------------------------
// Mollie-uitbetalingen afvinken
// -----------------------------------------------------------------------------

/** Een uitbetaling afvinken tegen het uittreksel, of het vinkje weghalen. */
export async function setMolliePayoutCheckAction(formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const reference = String(formData.get("reference") ?? "").trim();
  const checked = formData.get("checked") === "1";
  const result = await setPayoutCheck(reference, checked, session.user.id);
  if (result !== "OK") return saveError(result);
  await logAudit({
    action: "update",
    entity: "incomePayout",
    target: reference,
    summary: checked ? "afgevinkt tegen het uittreksel" : "vinkje weggehaald",
  });
  revalidate();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Periodes
// -----------------------------------------------------------------------------

export async function closeIncomePeriodAction(formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const from = parseMonth(String(formData.get("from") ?? ""));
  const to = parseMonth(String(formData.get("to") ?? ""));
  if (!from || !to || from > to) return saveError("BAD_PERIOD");
  const overlaps = (await listClosedPeriods()).some((period) => period.from <= to && from <= period.to);
  if (overlaps) return saveError("PERIOD_OVERLAP");

  await prisma.incomePeriod.create({
    data: { fromMonth: monthToDate(from), toMonth: monthToDate(to), closedById: session.user.id },
  });
  await logAudit({ action: "create", entity: "incomePeriod", target: `${from} tot ${to}`, summary: "afgesloten" });
  revalidate();
  return saveOk();
}

export async function reopenIncomePeriodAction(formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const period = await prisma.incomePeriod.findUnique({ where: { id }, select: { fromMonth: true, toMonth: true } });
  if (!period) return saveError("NOT_FOUND");
  await prisma.incomePeriod.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "incomePeriod",
    target: `${period.fromMonth.toISOString().slice(0, 7)} tot ${period.toMonth.toISOString().slice(0, 7)}`,
    summary: "heropend",
  });
  revalidate();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

export async function saveIncomeSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const raw = String(formData.get("feeAccountingCodeId") ?? "");
  if (raw) {
    const code = await prisma.accountingCode.findUnique({ where: { id: raw }, select: { id: true } });
    if (!code) return saveError("CODE_NOT_FOUND");
  }
  await saveIncomeConfig({ feeAccountingCodeId: raw || null });
  await logAudit({ action: "update", entity: "incomeSettings", target: "Kostencode", summary: raw ? "kostencode gekozen" : "kostencode leeggemaakt" });
  revalidate();
  return saveOk();
}

export async function saveIncomeChannelLabelAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const updated = await prisma.incomeChannel.updateMany({ where: { id }, data: { label: label || null } });
  if (updated.count === 0) return saveError("NOT_FOUND");
  await logAudit({ action: "update", entity: "incomeChannel", entityId: id, target: label || id, summary: "naam gewijzigd" });
  revalidate();
  return saveOk();
}

/**
 * De standaardcode van een kanaal (de QR-code van Theokot onder de code van
 * Theokot): wat erop binnenkomt en geen andere regel koppelt, krijgt die code.
 * Leeg zet zo'n betaling weer bij Na te kijken. De koppelregels lopen daarna
 * opnieuw, buiten de afgesloten periodes.
 */
export async function saveIncomeChannelCodeAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const codeId = String(formData.get("defaultAccountingCodeId") ?? "") || null;
  const channel = await prisma.incomeChannel.findUnique({ where: { id }, select: { identifier: true } });
  if (!channel) return saveError("NOT_FOUND");
  let code: { code: string; name: string } | null = null;
  if (codeId) {
    code = await prisma.accountingCode.findUnique({ where: { id: codeId }, select: { code: true, name: true } });
    if (!code) return saveError("CODE_NOT_FOUND");
  }
  await prisma.incomeChannel.update({ where: { id }, data: { defaultAccountingCodeId: codeId } });
  const changed = await rematchOpenTransactions();
  await logAudit({
    action: "update",
    entity: "incomeChannel",
    entityId: id,
    target: channel.identifier,
    summary: code ? `standaardcode ${code.code} ${code.name}` : "geen standaardcode",
  });
  revalidate();
  return saveOk(changed ? `Opgeslagen; ${transactions(changed)} opnieuw gekoppeld.` : undefined);
}

/** Vanaf welke dag een kanaal op welke rekening stort. */
export async function addIncomeChannelAccountAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const channelId = String(formData.get("channelId") ?? "");
  const fromRaw = String(formData.get("from") ?? "").trim();
  const bankAccount = String(formData.get("bankAccount") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!bankAccount) return saveError("ACCOUNT_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || Number.isNaN(Date.parse(`${fromRaw}T00:00:00Z`))) return saveError("BAD_DATE");
  const channel = await prisma.incomeChannel.findUnique({ where: { id: channelId }, select: { identifier: true } });
  if (!channel) return saveError("NOT_FOUND");

  const from = new Date(`${fromRaw}T00:00:00Z`);
  await prisma.incomeChannelAccount.upsert({
    where: { channelId_from: { channelId, from } },
    create: { channelId, from, bankAccount },
    update: { bankAccount },
  });
  await logAudit({
    action: "update",
    entity: "incomeChannel",
    entityId: channelId,
    target: channel.identifier,
    summary: `stort vanaf ${fromRaw} op ${bankAccount}`,
  });
  revalidate();
  return saveOk();
}

export async function deleteIncomeChannelAccountAction(formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const channelId = String(formData.get("channelId") ?? "");
  const fromRaw = String(formData.get("from") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) return saveError("BAD_DATE");
  const deleted = await prisma.incomeChannelAccount.deleteMany({
    where: { channelId, from: new Date(`${fromRaw}T00:00:00Z`) },
  });
  if (deleted.count === 0) return saveError("NOT_FOUND");
  await logAudit({ action: "update", entity: "incomeChannel", entityId: channelId, target: channelId, summary: `rekening vanaf ${fromRaw} weg` });
  revalidate();
  return saveOk();
}

/** Een onthouden tekst vergeten: wat ze koppelde, staat daarna weer bij Na te kijken. */
export async function deleteIncomeNameRuleAction(formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const rule = await prisma.incomeNameRule.findUnique({ where: { id }, select: { text: true } });
  if (!rule) return saveError("NOT_FOUND");
  await prisma.incomeNameRule.delete({ where: { id } });
  await rematchOpenTransactions();
  await logAudit({ action: "delete", entity: "incomeNameRule", entityId: id, target: rule.text });
  revalidate();
  return saveOk();
}
