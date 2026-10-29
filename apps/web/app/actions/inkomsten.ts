"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { getCashRegisterConfig } from "@/lib/kassas/server";
import { monthToDate, parseIncomeExport, parseMonth } from "@/lib/inkomsten/parse";
import {
  assignChannelDay,
  assignUnassignedGroup,
  importIncomeExport,
  listClosedPeriods,
  lockedMonthTest,
  changeTransactions,
  rematchOpenTransactions,
  saveIncomeConfig,
  setPayoutCheck,
  type ImportSummary,
  type TransactionSelection,
} from "@/lib/inkomsten/server";
import { paramGetter, parseTransactionFilter } from "@/lib/inkomsten/transactionFilter";

/** Foutcodes die /admin/inkomsten zelf vertaalt (`messages.ts`). */
export type IncomeErrorCode =
  | "NO_FILE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "EMPTY"
  | "UNKNOWN_FORMAT"
  | "BAD_ROW"
  | "NOT_FOUND"
  | "CODE_NOT_FOUND"
  | "CODE_REQUIRED"
  | "CANNOT_REMEMBER"
  | "LOCKED"
  | "BAD_PERIOD"
  | "PERIOD_OVERLAP"
  | "BAD_DATE"
  | "DAY_EMPTY"
  | "ACCOUNT_REQUIRED"
  | "DEVICE_NOT_FOUND"
  | "FILTER_CHANGED"
  | "NOTHING_SELECTED";

/** "1 transactie", "3 transacties". */
function transactions(count: number): string {
  return `${count} ${count === 1 ? "transactie" : "transacties"}`;
}

/** Een export van een kwartaal is een paar honderd kilobyte; dit laat ruim marge. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/**
 * Europabank geeft een bestand per dag, dus een semester van één terminal is
 * al gauw honderd bestanden. Samen blijven ze onder de 50 MB die een server
 * action mag ontvangen (`bodySizeLimit` in next.config.ts).
 */
const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

function revalidate(): void {
  revalidatePath("/admin/inkomsten", "layout");
}

async function readFiles(formData: FormData): Promise<Array<{ text: string; name: string }> | { error: IncomeErrorCode }> {
  const files = formData.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) return { error: "NO_FILE" };
  if (files.length > MAX_FILES) return { error: "TOO_MANY_FILES" };
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (files.some((file) => file.size > MAX_FILE_BYTES) || total > MAX_TOTAL_BYTES) return { error: "FILE_TOO_LARGE" };
  return Promise.all(files.map(async (file) => ({ text: await file.text(), name: file.name })));
}

// -----------------------------------------------------------------------------
// Opladen
// -----------------------------------------------------------------------------

/** Wat opladen met één bestand zou doen, of waarom de site het niet kan lezen. */
export type ImportFilePreview =
  | { fileName: string; ok: true; summary: ImportSummary }
  | { fileName: string; ok: false; code: IncomeErrorCode; detail?: string };

export type ImportPreviewState =
  | { status: "idle" }
  | { status: "preview"; files: ImportFilePreview[] }
  | { status: "error"; code: IncomeErrorCode; detail?: string };

/**
 * Lees de bestanden en zeg per bestand wat opladen zou doen, zonder iets te
 * bewaren. Wat een eerder bestand van dezelfde keuze al bevat, telt in een
 * volgend als al gekend, zoals bij het echte opladen na elkaar.
 */
export async function previewIncomeImportAction(formData: FormData): Promise<ImportPreviewState> {
  await requirePermission("income.manage");
  const files = await readFiles(formData);
  if ("error" in files) return { status: "error", code: files.error };
  const seen = new Set<string>();
  const results: ImportFilePreview[] = [];
  for (const file of files) {
    const outcome = await importIncomeExport(file.text, file.name, { dryRun: true, userId: null, seen });
    results.push(
      outcome.ok
        ? { fileName: file.name, ok: true, summary: outcome.summary }
        : { fileName: file.name, ok: false, code: outcome.error, detail: outcome.detail },
    );
  }
  return { status: "preview", files: results };
}

/**
 * De gekozen bestanden opladen, na elkaar, elk als eigen import (zodat er één
 * apart weg kan). Eerst worden ze allemaal gelezen: één onleesbaar bestand
 * houdt de hele keuze tegen, in plaats van de helft op te laden.
 */
export async function importIncomeAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const files = await readFiles(formData);
  if ("error" in files) return saveError(files.error);
  for (const file of files) {
    const parsed = parseIncomeExport(file.text);
    if (!parsed.ok) return saveError(parsed.error);
  }

  let created = 0;
  let duplicates = 0;
  let updated = 0;
  let open = 0;
  for (const file of files) {
    const outcome = await importIncomeExport(file.text, file.name, { dryRun: false, userId: session.user.id });
    if (!outcome.ok) return saveError(outcome.error);
    const { summary } = outcome;
    await logAudit({
      action: "import",
      entity: "incomeImport",
      entityId: outcome.importId ?? undefined,
      target: summary.fileName,
      summary: `${summary.created} nieuw, ${summary.duplicates} al gekend, ${summary.rules.OPEN} na te kijken`,
    });
    created += summary.created;
    duplicates += summary.duplicates;
    updated += summary.updated;
    open += summary.rules.OPEN;
  }
  revalidate();
  const parts = [`${transactions(created)} nieuw`];
  if (duplicates) parts.push(`${duplicates} al gekend`);
  if (updated) parts.push(`${updated} nu uitbetaald`);
  if (open) parts.push(`${open} na te kijken`);
  return saveOk(`Opgeladen${files.length > 1 ? ` (${files.length} bestanden)` : ""}: ${parts.join(", ")}.`);
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

/**
 * Een hele dag van een kanaal met de hand een code geven, of wat er die dag met
 * de hand gezet werd terug aan de koppelregels laten (`intent=reset`).
 */
export async function assignIncomeDayAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const channelId = String(formData.get("channelId") ?? "");
  const day = String(formData.get("day") ?? "");
  const reset = formData.get("intent") === "reset";
  const accountingCodeId = String(formData.get("accountingCodeId") ?? "");
  if (!reset && !accountingCodeId) return saveError("CODE_REQUIRED");

  const outcome = await assignChannelDay(channelId, day, reset ? { reset: true } : { accountingCodeId }, session.user.id);
  if (!outcome.ok) return saveError(outcome.error === "NOT_FOUND" ? "DAY_EMPTY" : outcome.error);

  await logAudit({
    action: "update",
    entity: "incomeTransaction",
    target: `${outcome.channel} · ${day}`,
    summary: reset ? `${transactions(outcome.count)} terug naar de koppelregels` : `${transactions(outcome.count)} met de hand toegewezen`,
  });
  revalidate();
  return saveOk(
    reset
      ? `${transactions(outcome.count)} van ${outcome.channel} terug naar de koppelregels.`
      : `${transactions(outcome.count)} van ${outcome.channel} toegewezen.`,
  );
}

/** Meer dan een pagina aanvinken kan niet; "alles wat aan de filter voldoet" gaat via `scope=filter`. */
const MAX_SELECTED = 1000;

/**
 * Transacties uit de lijst met de hand een code geven, laten wegvallen
 * (`intent=exclude`) of teruggeven aan de koppelregels (`intent=reset`): de
 * aangevinkte (`id`, herhaald), of met `scope=filter` alles wat aan de filter
 * voldoet (`filter`, de query van de pagina, en `expected`, hoeveel het scherm
 * er telde).
 */
export async function changeIncomeTransactionsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("income.manage");
  const intent = String(formData.get("intent") ?? "");
  const accountingCodeId = String(formData.get("accountingCodeId") ?? "");
  if (intent !== "exclude" && intent !== "reset" && !accountingCodeId) return saveError("CODE_REQUIRED");

  const query = String(formData.get("filter") ?? "");
  let selection: TransactionSelection;
  if (formData.get("scope") === "filter") {
    const expected = Number(formData.get("expected"));
    if (!Number.isInteger(expected) || expected <= 0) return saveError("FILTER_CHANGED");
    selection = { filter: parseTransactionFilter(paramGetter(new URLSearchParams(query))), expected };
  } else {
    selection = { ids: [...new Set(formData.getAll("id").map(String))].slice(0, MAX_SELECTED) };
  }

  const outcome = await changeTransactions(
    selection,
    intent === "reset" ? { reset: true } : intent === "exclude" ? { exclude: true } : { accountingCodeId },
    session.user.id,
  );
  if (!outcome.ok) return saveError(outcome.error);

  const what =
    intent === "reset"
      ? `${transactions(outcome.count)} terug naar de koppelregels`
      : outcome.code
        ? `${transactions(outcome.count)} toegewezen aan ${outcome.code.code} ${outcome.code.name}`
        : `${transactions(outcome.count)}: telt niet mee`;
  await logAudit({
    action: "update",
    entity: "incomeTransaction",
    ...("ids" in selection && selection.ids.length === 1 ? { entityId: selection.ids[0] } : {}),
    target: "ids" in selection ? (selection.ids.length === 1 ? selection.ids[0] : transactions(selection.ids.length)) : `filter ${query || "(alles)"}`,
    summary: `${what}, met de hand`,
  });
  revalidate();

  const notes: string[] = [];
  if (outcome.notManual > 0) {
    notes.push(
      outcome.notManual === 1
        ? "1 stond niet met de hand en volgde de regels al."
        : `${outcome.notManual} stonden niet met de hand en volgden de regels al.`,
    );
  }
  if (outcome.unlinked > 0) {
    notes.push(
      outcome.unlinked === 1
        ? "Bij 1 is de koppeling met een kassa of een betaling van de site losgemaakt."
        : `Bij ${outcome.unlinked} is de koppeling met een kassa of een betaling van de site losgemaakt.`,
    );
  }
  if (outcome.locked > 0) {
    notes.push(
      outcome.locked === 1
        ? "1 valt in een afgesloten maand en bleef zoals ze was."
        : `${outcome.locked} vallen in een afgesloten maand en bleven zoals ze waren.`,
    );
  }
  if (intent === "reset" && outcome.count === 0) return saveOk(["Niets stond met de hand; de koppelregels gelden al.", ...notes.slice(1)].join(" "));
  return saveOk([`${what}.`, ...notes].join(" "));
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
export async function setPayoutCheckAction(formData: FormData): Promise<SaveState> {
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
 * Vanaf welke dag een kanaal welke standaardcode heeft (de SumUp van Theokot
 * onder de code van Theokot). Zonder code heeft het kanaal vanaf die dag geen,
 * en staat zo'n betaling bij Na te kijken: zo gebruikte de cursusdienst in
 * september de SumUp van Theokot. De koppelregels lopen daarna opnieuw, buiten
 * de afgesloten periodes.
 */
export async function addIncomeChannelCodeAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const channelId = String(formData.get("channelId") ?? "");
  const fromRaw = String(formData.get("from") ?? "").trim();
  const codeId = String(formData.get("accountingCodeId") ?? "") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || Number.isNaN(Date.parse(`${fromRaw}T00:00:00Z`))) return saveError("BAD_DATE");
  const channel = await prisma.incomeChannel.findUnique({ where: { id: channelId }, select: { identifier: true } });
  if (!channel) return saveError("NOT_FOUND");
  let code: { code: string; name: string } | null = null;
  if (codeId) {
    code = await prisma.accountingCode.findUnique({ where: { id: codeId }, select: { code: true, name: true } });
    if (!code) return saveError("CODE_NOT_FOUND");
  }

  const from = new Date(`${fromRaw}T00:00:00Z`);
  await prisma.incomeChannelCode.upsert({
    where: { channelId_from: { channelId, from } },
    create: { channelId, from, accountingCodeId: codeId },
    update: { accountingCodeId: codeId },
  });
  const changed = await rematchOpenTransactions();
  await logAudit({
    action: "update",
    entity: "incomeChannel",
    entityId: channelId,
    target: channel.identifier,
    summary: code ? `standaardcode ${code.code} ${code.name} vanaf ${fromRaw}` : `geen standaardcode vanaf ${fromRaw}`,
  });
  revalidate();
  return saveOk(changed ? `Toegevoegd; ${transactions(changed)} opnieuw gekoppeld.` : undefined);
}

/** Een standaardcode weghalen: vanaf die dag geldt weer de regel ervoor, of geen. */
export async function deleteIncomeChannelCodeAction(formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const channelId = String(formData.get("channelId") ?? "");
  const fromRaw = String(formData.get("from") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) return saveError("BAD_DATE");
  const deleted = await prisma.incomeChannelCode.deleteMany({
    where: { channelId, from: new Date(`${fromRaw}T00:00:00Z`) },
  });
  if (deleted.count === 0) return saveError("NOT_FOUND");
  const changed = await rematchOpenTransactions();
  await logAudit({ action: "update", entity: "incomeChannel", entityId: channelId, target: channelId, summary: `standaardcode vanaf ${fromRaw} weg` });
  revalidate();
  return saveOk(changed ? `Verwijderd; ${transactions(changed)} opnieuw gekoppeld.` : undefined);
}

/**
 * Welk toestel van de kassa's een kanaal is (de sticker "A: Evenement 2" is de
 * Payconiq-rekening "Evenementen 2"), zodat een kassa naast het ingetikte bedrag
 * toont wat de import op dat toestel zag, en wat er tijdens een kassa binnenkwam
 * haar code krijgt (regel 4). Leeg = niet gekoppeld. Een Payconiq-kanaal is een
 * Payconiq-rekening, een SumUp-account of Europabank-terminal een
 * Bancontact-bakje.
 */
export async function saveIncomeChannelDeviceAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("income.manage");
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("device") ?? "");
  const channel = await prisma.incomeChannel.findUnique({
    where: { id },
    select: { identifier: true, source: true, cashMethod: true, cashTerminal: true },
  });
  if (!channel) return saveError("NOT_FOUND");

  let cashMethod: "BANCONTACT" | "PAYCONIQ" | null = null;
  let cashTerminal: string | null = null;
  if (raw) {
    const separator = raw.indexOf("|");
    const method = raw.slice(0, separator);
    const terminal = raw.slice(separator + 1);
    const config = await getCashRegisterConfig();
    // Een toestel dat intussen hernoemd werd, mag blijven staan waar het stond.
    const unchanged = method === channel.cashMethod && terminal === channel.cashTerminal;
    const fits =
      channel.source === "PAYCONIQ"
        ? method === "PAYCONIQ" && config.payconiqAccounts.includes(terminal)
        : (channel.source === "SUMUP" || channel.source === "EUROPABANK") &&
          method === "BANCONTACT" &&
          config.bancontactTerminals.includes(terminal);
    if (separator < 0 || !(fits || unchanged)) return saveError("DEVICE_NOT_FOUND");
    cashMethod = method === "BANCONTACT" ? "BANCONTACT" : "PAYCONIQ";
    cashTerminal = terminal;
  }

  await prisma.incomeChannel.update({ where: { id }, data: { cashMethod, cashTerminal } });
  const changed = await rematchOpenTransactions();
  await logAudit({
    action: "update",
    entity: "incomeChannel",
    entityId: id,
    target: channel.identifier,
    summary: cashTerminal ? `toestel ${cashMethod === "BANCONTACT" ? "Bancontact" : "Payconiq"} ${cashTerminal}` : "geen toestel",
  });
  revalidate();
  revalidatePath("/admin/kassas", "layout");
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
