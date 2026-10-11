"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear, FIRST_WORKING_YEAR } from "@/lib/workingYear";
import { nameKey as toNameKey, cleanLabel } from "@/lib/praesidiumShifts/names";
import {
  createList,
  deleteAlias,
  ListInputError,
  loadRoster,
  MAX_UPLOAD_BYTES,
  replaceListFile,
  saveAlias,
  saveNameChoices,
  setNecessity,
  LIST_SELECT,
  toStatsList,
} from "@/lib/praesidiumShifts/server";
import { summarizeList, type ColorSetting, type SheetSetting } from "@/lib/praesidiumShifts/stats";

/*
 * Acties van het shiftenoverzicht van het praesidium. Elk ervan vraagt
 * `shift.praesidium` opnieuw: een server action is een gewoon POST-adres.
 */

function revalidateOverview() {
  revalidatePath("/[locale]/admin/shiftenoverzicht", "layout");
}

function base(formData: FormData): string {
  return formData.get("locale") === "en" ? "/en" : "";
}

function readFile(formData: FormData): File | SaveState {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return saveError("FILE_REQUIRED");
  if (file.size > MAX_UPLOAD_BYTES) return saveError("FILE_TOO_LARGE");
  if (!/\.xlsx$/i.test(file.name || "")) return saveError("NOT_XLSX");
  return file;
}

function inputError(err: unknown): SaveState {
  if (err instanceof ListInputError) return saveError(err.code, err.detail);
  throw err;
}

/** Namen op meetellende tabbladen en kleuren die nog op een keuze wachten. */
async function openNameCount(listId: string): Promise<number> {
  const [list, entries, names] = await Promise.all([
    prisma.praesidiumShiftList.findUniqueOrThrow({ where: { id: listId }, select: LIST_SELECT }),
    prisma.praesidiumShiftEntry.findMany({
      where: { listId },
      select: { listId: true, nameKey: true, sheet: true, color: true, hours: true, excluded: true },
    }),
    prisma.praesidiumShiftListName.findMany({
      where: { listId },
      select: { listId: true, nameKey: true, status: true, userId: true },
    }),
  ]);
  return summarizeList(toStatsList(list), entries, names).unresolvedNames;
}

async function listOrNull(id: string) {
  return prisma.praesidiumShiftList.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, year: true, status: true },
  });
}

// ---------------------------------------------------------------------------
// Opladen
// ---------------------------------------------------------------------------

export async function uploadPraesidiumShiftListAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("shift.praesidium");
  const file = readFile(formData);
  if (!(file instanceof File)) return file;

  const kind = formData.get("kind") === "WEEKLY" ? "WEEKLY" : "EVENT";
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < FIRST_WORKING_YEAR || year > currentWorkingYear() + 1) {
    return saveError("INVALID_INPUT");
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return saveError("NAME_REQUIRED");

  let created;
  try {
    created = await createList({
      kind,
      year,
      name,
      fileName: file.name.slice(0, 200),
      buffer: Buffer.from(await file.arrayBuffer()),
      uploadedById: session.user.id,
    });
  } catch (err) {
    return inputError(err);
  }
  await logAudit({
    action: "import",
    entity: "praesidiumShiftList",
    entityId: created.id,
    target: name,
    summary: `${created.names} namen, ${created.unresolved} nog te koppelen`,
  });
  revalidateOverview();
  // Naar het nakijkscherm: daar beslist de vice over de tabbladen en de namen.
  redirect(`${base(formData)}/admin/shiftenoverzicht/lijst/${created.id}`);
}

export async function replacePraesidiumShiftListFileAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("shift.praesidium");
  const list = await listOrNull(String(formData.get("listId") ?? ""));
  if (!list) return saveError("LIST_NOT_FOUND");
  const file = readFile(formData);
  if (!(file instanceof File)) return file;

  let result;
  try {
    result = await replaceListFile({
      listId: list.id,
      fileName: file.name.slice(0, 200),
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  } catch (err) {
    return inputError(err);
  }
  await logAudit({
    action: "import",
    entity: "praesidiumShiftList",
    entityId: list.id,
    target: list.name,
    summary: `nieuwe versie, ${result.added} nieuwe namen`,
  });
  revalidateOverview();
  const nl = formData.get("locale") !== "en";
  if (result.added === 0) {
    return saveOk(nl ? "Nieuwe versie ingelezen; er kwamen geen nieuwe namen bij." : "New version read; no new names.");
  }
  return saveOk(
    nl
      ? `Nieuwe versie ingelezen: ${result.added} nieuwe ${result.added === 1 ? "naam" : "namen"}, waarvan ${result.unresolved} op een keuze ${result.unresolved === 1 ? "wacht" : "wachten"}.`
      : `New version read: ${result.added} new names, ${result.unresolved} waiting for a choice.`,
  );
}

// ---------------------------------------------------------------------------
// Instellingen, bevestigen, verwijderen
// ---------------------------------------------------------------------------

function optionalNumber(value: FormDataEntryValue | null, { min, max }: { min: number; max: number }): number | null | "invalid" {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return "invalid";
  return n;
}

export async function savePraesidiumShiftListSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("shift.praesidium");
  const id = String(formData.get("listId") ?? "");
  const list = await prisma.praesidiumShiftList.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, sheets: true, colors: true },
  });
  if (!list) return saveError("LIST_NOT_FOUND");

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return saveError("NAME_REQUIRED");
  const dateRaw = String(formData.get("eventDate") ?? "").trim();
  const eventDate = dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : null;
  if (eventDate && Number.isNaN(eventDate.getTime())) return saveError("INVALID_INPUT");
  const expected = optionalNumber(formData.get("expectedPerMember"), { min: 0, max: 100 });
  const openSlots = optionalNumber(formData.get("openSlots"), { min: 0, max: 10_000 });
  const hours = optionalNumber(formData.get("hoursPerShift"), { min: 0.25, max: 24 });
  if (expected === "invalid" || openSlots === "invalid" || hours === "invalid") return saveError("INVALID_NUMBER");
  const countMode = formData.get("countMode") === "BY_DURATION" ? "BY_DURATION" : "PER_NAME";

  // Een niet-aangevinkt vakje stuurt niets mee: wat in het formulier stond en
  // ontbreekt, staat uit. `sheetsShown` zegt welke er in het formulier stonden.
  const counted = new Set(formData.getAll("sheet").map(String));
  const sheets = (list.sheets as SheetSetting[]).map((sheet) =>
    sheet.kind === "SHIFTS" || sheet.kind === "SCHEDULE" ? { ...sheet, counted: counted.has(sheet.name) } : sheet,
  );
  const countedColors = new Set(formData.getAll("color").map(String));
  const colors = (list.colors as ColorSetting[]).map((color) => ({
    ...color,
    counted: countedColors.has(color.color ?? "none"),
  }));
  if (list.kind === "EVENT" && colors.length > 0 && !colors.some((c) => c.counted)) return saveError("NO_COLOR");
  if (!sheets.some((s) => s.counted)) return saveError("NO_SHEET");

  await prisma.praesidiumShiftList.update({
    where: { id },
    data: {
      name,
      eventDate,
      expectedPerMember: expected,
      openSlots: openSlots === null ? null : Math.round(openSlots),
      countMode,
      // Uitgeschakeld bij "elke naam is één shift": dan komt er niets mee, en
      // blijft de vorige lengte staan voor wie later terugschakelt.
      ...(hours !== null ? { hoursPerShift: hours } : {}),
      sheets: sheets as Prisma.InputJsonValue,
      colors: colors as Prisma.InputJsonValue,
    },
  });
  await logAudit({ action: "update", entity: "praesidiumShiftList", entityId: id, target: name, summary: "instellingen" });
  revalidateOverview();
  return saveOk();
}

export async function confirmPraesidiumShiftListAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("shift.praesidium");
  const list = await listOrNull(String(formData.get("listId") ?? ""));
  if (!list) return saveError("LIST_NOT_FOUND");
  await prisma.praesidiumShiftList.update({ where: { id: list.id }, data: { status: "ACTIVE" } });
  await logAudit({ action: "publish", entity: "praesidiumShiftList", entityId: list.id, target: list.name, summary: "bevestigd" });
  revalidateOverview();
  return saveOk();
}

export async function deletePraesidiumShiftListAction(formData: FormData): Promise<void | SaveState> {
  await requirePermission("shift.praesidium");
  const list = await listOrNull(String(formData.get("listId") ?? ""));
  if (!list) return saveError("LIST_NOT_FOUND");
  await prisma.praesidiumShiftList.delete({ where: { id: list.id } });
  await logAudit({ action: "delete", entity: "praesidiumShiftList", entityId: list.id, target: list.name });
  revalidateOverview();
  // De lijst bestaat niet meer, dus terug naar het tabblad waar ze stond.
  const tab = list.kind === "WEEKLY" ? "/praesidiumshiften" : "";
  redirect(`${base(formData)}/admin/shiftenoverzicht${tab}?jaar=${list.year}`);
}

// ---------------------------------------------------------------------------
// Namen en bijnamen
// ---------------------------------------------------------------------------

export async function savePraesidiumShiftNamesAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("shift.praesidium");
  const list = await listOrNull(String(formData.get("listId") ?? ""));
  if (!list) return saveError("LIST_NOT_FOUND");

  const roster = await loadRoster(list.year);
  const keys = formData.getAll("nameKey").map(String);
  const remembered = new Set(formData.getAll("remember").map(String));
  const choices = keys.map((nameKey) => ({
    nameKey,
    choice: String(formData.get(`choice:${nameKey}`) ?? ""),
    remember: remembered.has(nameKey),
  }));
  const result = await saveNameChoices({
    listId: list.id,
    choices,
    actorId: session.user.id,
    allowedUserIds: new Set(roster.map((m) => m.userId)),
  });

  const confirm = formData.get("intent") === "confirm" && list.status === "DRAFT";
  if (confirm) await prisma.praesidiumShiftList.update({ where: { id: list.id }, data: { status: "ACTIVE" } });
  if (result.changed > 0 || confirm) {
    await logAudit({
      action: confirm ? "publish" : "update",
      entity: "praesidiumShiftList",
      entityId: list.id,
      target: list.name,
      summary: `${result.changed} namen gekoppeld, ${result.remembered} als bijnaam onthouden${confirm ? ", bevestigd" : ""}`,
    });
  }
  revalidateOverview();

  const nl = formData.get("locale") !== "en";
  const open = await openNameCount(list.id);
  const rest =
    open > 0
      ? nl
        ? ` ${open} ${open === 1 ? "naam wacht" : "namen wachten"} nog op een keuze; hun shiften tellen voor niemand.`
        : ` ${open} names still wait for a choice; their shifts count for nobody.`
      : "";
  if (confirm) return saveOk(`${nl ? "Lijst bevestigd: ze telt nu mee." : "List confirmed: it counts now."}${rest}`);
  if (result.changed === 0) return saveOk(`${nl ? "Niets gewijzigd." : "Nothing changed."}${rest}`);
  const parts = nl
    ? [`${result.changed} ${result.changed === 1 ? "naam" : "namen"} bewaard`]
    : [`${result.changed} names saved`];
  if (result.remembered > 0) {
    parts.push(nl ? `${result.remembered} onthouden als bijnaam` : `${result.remembered} remembered as nickname`);
  }
  return saveOk(`${parts.join(", ")}.${rest}`);
}

export async function savePraesidiumShiftAliasAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("shift.praesidium");
  const label = cleanLabel(String(formData.get("label") ?? "")).slice(0, 80);
  const key = toNameKey(label);
  if (!key) return saveError("NAME_REQUIRED");
  const target = String(formData.get("target") ?? "");
  if (!target) return saveError("TARGET_REQUIRED");
  let userId: string | null = null;
  if (target !== "ignore") {
    const user = await prisma.user.findFirst({ where: { id: target, deletedAt: null }, select: { id: true } });
    if (!user) return saveError("TARGET_REQUIRED");
    userId = user.id;
  }
  await saveAlias({ nameKey: key, label, userId, actorId: session.user.id });
  await logAudit({
    action: "update",
    entity: "praesidiumShiftAlias",
    entityId: key,
    target: label,
    summary: userId ? "gekoppeld" : "negeren",
  });
  revalidateOverview();
  return saveOk();
}

export async function deletePraesidiumShiftAliasAction(formData: FormData): Promise<SaveState> {
  await requirePermission("shift.praesidium");
  const key = String(formData.get("nameKey") ?? "");
  const alias = await prisma.praesidiumShiftAlias.findUnique({ where: { nameKey: key }, select: { label: true } });
  if (!alias) return saveError("ALIAS_NOT_FOUND");
  const lists = await deleteAlias(key);
  await logAudit({
    action: "delete",
    entity: "praesidiumShiftAlias",
    entityId: key,
    target: alias.label,
    summary: `${lists} lijsten opnieuw voorgesteld`,
  });
  revalidateOverview();
  return saveOk();
}

// ---------------------------------------------------------------------------
// Noodzaak op /shift
// ---------------------------------------------------------------------------

export async function setPraesidiumShiftNecessityAction(formData: FormData): Promise<SaveState> {
  const session = await requirePermission("shift.praesidium");
  const shiftId = String(formData.get("shiftId") ?? "");
  const userIds = String(formData.get("userIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const necessary = formData.get("necessary") === "1";
  const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { id: true, name: true } });
  if (!shift || userIds.length === 0) return saveError("SHIFT_NOT_FOUND");

  await setNecessity({ shiftId, userIds, necessary, actorId: session.user.id });
  await logAudit({
    action: "update",
    entity: "praesidiumShiftNecessity",
    entityId: shiftId,
    target: shift.name,
    summary: `${userIds.length} ${necessary ? "noodzakelijk" : "vrije wil"}`,
  });
  revalidateOverview();
  return saveOk();
}
