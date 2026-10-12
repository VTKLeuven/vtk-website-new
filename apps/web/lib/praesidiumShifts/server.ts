import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { workingYearStart } from "@/lib/workingYear";
import { readWorkbook, XlsxError } from "@/lib/praesidiumShifts/xlsx";
import {
  analyzeEventWorkbook,
  analyzeWeeklyWorkbook,
  type Analysis,
  type ParsedSheet,
} from "@/lib/praesidiumShifts/analyze";
import {
  nameKey as toKey,
  proposeMatch,
  type AliasTarget,
  type MatchSource,
  type MatchStatus,
  type RosterPerson,
} from "@/lib/praesidiumShifts/names";
import {
  attachOverrides,
  reanchorOverrides,
  type ColorSetting,
  type CountMode,
  type ListKind,
  type SheetSetting,
  type SlotStat,
  type StatsList,
} from "@/lib/praesidiumShifts/stats";

/*
 * De databasekant van het shiftenoverzicht. Elke functie hier gaat ervan uit
 * dat de aanroeper `shift.praesidium` al controleerde (de pagina's en de
 * actions in app/[locale]/admin/shiftenoverzicht).
 */

/** Een upload groter dan dit is geen shiftenlijst meer; 24UL is 1 MB. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export class ListInputError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}

// ---------------------------------------------------------------------------
// Het praesidium van een werkingsjaar
// ---------------------------------------------------------------------------

export type RosterMember = RosterPerson & {
  phone: string | null;
  /** Postnamen van dit werkingsjaar, in de volgorde van /praesidium. */
  posts: string[];
};

/** Iedereen met een praesidiumpost in `year`, één keer, op naam gesorteerd. */
export async function loadRoster(year: number, locale: "nl" | "en" = "nl"): Promise<RosterMember[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { year, group: { type: "PRAESIDIUM" }, user: { deletedAt: null } },
    orderBy: [{ group: { orderInPraesidium: "asc" } }, { displayOrder: "asc" }],
    select: {
      group: { select: { nameNl: true, nameEn: true } },
      user: { select: { id: true, name: true, firstName: true, lastName: true, phone: true } },
    },
  });
  const byUser = new Map<string, RosterMember>();
  for (const { group, user } of memberships) {
    const member =
      byUser.get(user.id) ??
      {
        userId: user.id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone?.trim() || null,
        posts: [],
      };
    const post = locale === "nl" ? group.nameNl : group.nameEn;
    if (!member.posts.includes(post)) member.posts.push(post);
    byUser.set(user.id, member);
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export async function loadAliasMap(): Promise<Map<string, AliasTarget>> {
  const aliases = await prisma.praesidiumShiftAlias.findMany({ select: { nameKey: true, userId: true, notAName: true } });
  return new Map(aliases.map((a) => [a.nameKey, { userId: a.userId, notAName: a.notAName }]));
}

/** Werkingsjaren waarin er lijsten of praesidiumposten zijn, voor de jaarkiezer. */
export async function yearsWithData(): Promise<number[]> {
  const [lists, memberships] = await Promise.all([
    prisma.praesidiumShiftList.findMany({ distinct: ["year"], select: { year: true } }),
    prisma.groupMembership.findMany({
      where: { group: { type: "PRAESIDIUM" } },
      distinct: ["year"],
      select: { year: true },
    }),
  ]);
  return [...new Set([...lists.map((l) => l.year), ...memberships.map((m) => m.year)])];
}

// ---------------------------------------------------------------------------
// Een lijst inlezen
// ---------------------------------------------------------------------------

function analyze(kind: ListKind, buffer: Buffer): Analysis {
  let workbook;
  try {
    workbook = readWorkbook(buffer);
  } catch (err) {
    if (err instanceof XlsxError) throw new ListInputError("NOT_XLSX");
    throw err;
  }
  const analysis = kind === "WEEKLY" ? analyzeWeeklyWorkbook(workbook) : analyzeEventWorkbook(workbook);
  if (analysis.entries.length === 0) throw new ListInputError("NO_NAMES");
  return analysis;
}

const isVtk = (kring: string | null) => !kring || /^\s*vtk\s*$/i.test(kring);

/**
 * Namen die volgens het overzichtstabblad bij een andere kring horen. Ook de
 * voornaam alleen ("Manosj" voor Manosj Vos van Industria), maar enkel als
 * niemand van VTK in dat overzicht en niemand in het praesidium zo heet: anders
 * zou één Industria-Boris onze Boris laten wegvallen.
 */
function otherKringMap(analysis: Analysis, roster: RosterPerson[]): Map<string, string> {
  const map = new Map<string, string>();
  const firstOf = (key: string) => key.split(" ")[0] ?? "";
  const vtkFirst = new Set(analysis.contacts.filter((c) => isVtk(c.kring)).map((c) => firstOf(c.nameKey)));
  const rosterFirst = new Set(
    roster.map((p) => firstOf(p.firstName ? toKey(p.firstName) : toKey(p.name))),
  );
  for (const contact of analysis.contacts) {
    if (isVtk(contact.kring)) continue;
    const kring = contact.kring!.trim();
    map.set(contact.nameKey, kring);
    const first = firstOf(contact.nameKey);
    if (first && !vtkFirst.has(first) && !rosterFirst.has(first) && !map.has(first)) map.set(first, kring);
  }
  return map;
}

type NameRow = {
  nameKey: string;
  label: string;
  status: MatchStatus;
  source: MatchSource;
  userId: string | null;
};

function proposeNames(
  analysis: Analysis,
  roster: RosterPerson[],
  aliases: Map<string, AliasTarget>,
  skip: Set<string> = new Set(),
): NameRow[] {
  const otherKring = otherKringMap(analysis, roster);
  const rows = new Map<string, NameRow>();
  for (const entry of analysis.entries) {
    if (rows.has(entry.nameKey) || skip.has(entry.nameKey)) continue;
    const proposal = proposeMatch(entry.nameKey, roster, aliases, otherKring);
    rows.set(entry.nameKey, {
      nameKey: entry.nameKey,
      label: entry.label,
      status: proposal.status,
      source: proposal.source,
      userId: proposal.userId,
    });
  }
  return [...rows.values()];
}

function contactRows(analysis: Analysis, roster: RosterPerson[], aliases: Map<string, AliasTarget>) {
  return analysis.contacts.map((contact) => {
    // Een nummer hangen we enkel aan iemand bij een volledige naam of een
    // bijnaam; "Jarne" in een overzicht is niet genoeg om iemand te bellen.
    const proposal = proposeMatch(contact.nameKey, roster, aliases);
    const sure = proposal.status === "MATCHED" && ["FULL_NAME", "FUZZY", "ALIAS"].includes(proposal.source);
    return {
      name: contact.name,
      nameKey: contact.nameKey,
      kring: contact.kring,
      phone: contact.phone,
      email: contact.email,
      userId: sure ? proposal.userId : null,
    };
  });
}

function entryRows(analysis: Analysis) {
  return analysis.entries.map((entry) => ({
    sheet: entry.sheet,
    cell: entry.cell,
    rawName: entry.rawName.slice(0, 200),
    nameKey: entry.nameKey,
    color: entry.color,
    role: entry.role?.slice(0, 200) ?? null,
    slot: entry.slot,
    date: entry.date,
    hours: entry.hours,
    note: entry.note?.slice(0, 300) ?? null,
    done: entry.done,
    excluded: entry.excluded,
  }));
}

function colorSettings(analysis: Analysis, previous: ColorSetting[] = []): ColorSetting[] {
  return analysis.colors.map((color) => ({
    ...color,
    counted: previous.find((p) => p.color === color.color)?.counted ?? true,
  }));
}

function sheetSettings(analysis: Analysis, previous: SheetSetting[] = []): SheetSetting[] {
  return analysis.sheets.map((sheet: ParsedSheet) => {
    const before = previous.find((p) => p.name === sheet.name);
    // Een tabblad dat eerder leeg was en nu namen heeft, volgt de analyse.
    const counted = before && before.kind === sheet.kind ? before.counted : sheet.counted;
    return { ...sheet, counted: sheet.kind === "SHIFTS" || sheet.kind === "SCHEDULE" ? counted : false };
  });
}

export async function createList(input: {
  kind: ListKind;
  year: number;
  name: string;
  fileName: string;
  buffer: Buffer;
  uploadedById: string;
}): Promise<{ id: string; names: number; unresolved: number }> {
  const analysis = analyze(input.kind, input.buffer);
  const [roster, aliases] = await Promise.all([loadRoster(input.year), loadAliasMap()]);
  const names = proposeNames(analysis, roster, aliases);

  const list = await prisma.praesidiumShiftList.create({
    data: {
      kind: input.kind,
      year: input.year,
      name: input.name,
      fileName: input.fileName,
      eventDate: analysis.eventDate,
      expectedPerMember: analysis.suggestedExpected,
      sheets: sheetSettings(analysis) as Prisma.InputJsonValue,
      colors: colorSettings(analysis) as Prisma.InputJsonValue,
      slots: analysis.slots as Prisma.InputJsonValue,
      uploadedById: input.uploadedById,
      entries: { createMany: { data: entryRows(analysis) } },
      names: { createMany: { data: names } },
      contacts: { createMany: { data: contactRows(analysis, roster, aliases) } },
    },
    select: { id: true },
  });
  return { id: list.id, names: names.length, unresolved: names.filter((n) => n.status === "UNRESOLVED").length };
}

/**
 * Een nieuwe export van dezelfde lijst. De vakjes en contacten worden
 * vervangen; de instellingen, de keuzes per naam en de keuzes per vakje
 * blijven, zodat de vice enkel de namen moet nakijken die er sinds de vorige
 * keer bijkwamen. Een keuze per vakje waarvan het vakje niet meer terug te
 * vinden is, vervalt (`lostCells`).
 */
export async function replaceListFile(input: {
  listId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<{ added: number; unresolved: number; lostCells: number }> {
  const list = await prisma.praesidiumShiftList.findUniqueOrThrow({
    where: { id: input.listId },
    select: {
      kind: true,
      year: true,
      sheets: true,
      colors: true,
      eventDate: true,
      names: { select: { nameKey: true } },
      cells: {
        select: {
          sheet: true,
          cell: true,
          nameKey: true,
          userId: true,
          role: true,
          slot: true,
          date: true,
          updatedById: true,
          createdAt: true,
        },
      },
    },
  });
  const analysis = analyze(list.kind, input.buffer);
  const [roster, aliases] = await Promise.all([loadRoster(list.year), loadAliasMap()]);
  const known = new Set(list.names.map((n) => n.nameKey));
  const present = new Set(analysis.entries.map((e) => e.nameKey));
  const added = proposeNames(analysis, roster, aliases, known);
  const newEntries = entryRows(analysis);
  const cells = reanchorOverrides(list.cells, newEntries);

  await prisma.$transaction([
    prisma.praesidiumShiftCellOverride.deleteMany({ where: { listId: input.listId } }),
    prisma.praesidiumShiftEntry.deleteMany({ where: { listId: input.listId } }),
    prisma.praesidiumShiftContact.deleteMany({ where: { listId: input.listId } }),
    prisma.praesidiumShiftListName.deleteMany({
      where: { listId: input.listId, nameKey: { notIn: [...present] } },
    }),
    prisma.praesidiumShiftEntry.createMany({
      data: newEntries.map((row) => ({ ...row, listId: input.listId })),
    }),
    prisma.praesidiumShiftCellOverride.createMany({
      data: cells.kept.map((cell) => ({ ...cell, listId: input.listId })),
    }),
    prisma.praesidiumShiftContact.createMany({
      data: contactRows(analysis, roster, aliases).map((row) => ({ ...row, listId: input.listId })),
    }),
    prisma.praesidiumShiftListName.createMany({
      data: added.map((row) => ({ ...row, listId: input.listId })),
    }),
    prisma.praesidiumShiftList.update({
      where: { id: input.listId },
      data: {
        fileName: input.fileName,
        eventDate: list.eventDate ?? analysis.eventDate,
        sheets: sheetSettings(analysis, list.sheets as SheetSetting[]) as Prisma.InputJsonValue,
        colors: colorSettings(analysis, list.colors as ColorSetting[]) as Prisma.InputJsonValue,
        slots: analysis.slots as Prisma.InputJsonValue,
      },
    }),
  ]);
  return {
    added: added.length,
    unresolved: added.filter((n) => n.status === "UNRESOLVED").length,
    lostCells: cells.lost.length,
  };
}

// ---------------------------------------------------------------------------
// Keuzes per naam en bijnamen
// ---------------------------------------------------------------------------

/** Leeg: nog niet gekozen. `ignore`: geen praesidium. `noname`: geen persoon. Anders een id. */
export type NameChoice = "" | "ignore" | "noname" | string;

function choiceState(choice: NameChoice): { status: MatchStatus; userId: string | null } {
  if (choice === "") return { status: "UNRESOLVED", userId: null };
  if (choice === "ignore") return { status: "IGNORED", userId: null };
  if (choice === "noname") return { status: "NOT_A_NAME", userId: null };
  return { status: "MATCHED", userId: choice };
}

/** De keuze die een rij nu heeft, in de woorden van `NameChoice`. */
function currentChoice(row: { status: MatchStatus; userId: string | null }): NameChoice {
  if (row.status === "MATCHED") return row.userId ?? "";
  if (row.status === "IGNORED") return "ignore";
  if (row.status === "NOT_A_NAME") return "noname";
  return "";
}

/**
 * Past een bijnaam toe op elke lijst waar deze schrijfwijze niet met de hand
 * gekozen is. Zo koppelt "Mekkie" ook op een oudere lijst waar hij nog open
 * stond, of waar de voornaam toevallig naar iemand anders wees.
 */
async function propagateAlias(
  tx: Prisma.TransactionClient,
  nameKey: string,
  target: { userId: string | null; notAName: boolean },
  exceptListId?: string,
) {
  await tx.praesidiumShiftListName.updateMany({
    where: { nameKey, source: { not: "MANUAL" }, ...(exceptListId ? { listId: { not: exceptListId } } : {}) },
    data: {
      status: target.userId ? "MATCHED" : target.notAName ? "NOT_A_NAME" : "IGNORED",
      userId: target.userId,
      source: "ALIAS",
    },
  });
}

/**
 * Bewaart de keuzes van de vice voor de namen van één lijst. Enkel wat
 * veranderde, wordt geschreven: een automatische koppeling die hij liet staan,
 * blijft automatisch. Met "onthouden" wordt een gewijzigde keuze een bijnaam
 * die ook voor de andere lijsten geldt.
 */
export async function saveNameChoices(input: {
  listId: string;
  choices: { nameKey: string; choice: NameChoice; remember: boolean }[];
  actorId: string;
  allowedUserIds: Set<string>;
}): Promise<{ changed: number; remembered: number }> {
  const current = await prisma.praesidiumShiftListName.findMany({
    where: { listId: input.listId, nameKey: { in: input.choices.map((c) => c.nameKey) } },
    select: { nameKey: true, label: true, status: true, userId: true },
  });
  const byKey = new Map(current.map((row) => [row.nameKey, row]));
  let changed = 0;
  let remembered = 0;

  await prisma.$transaction(async (tx) => {
    for (const { nameKey, choice, remember } of input.choices) {
      const row = byKey.get(nameKey);
      if (!row) continue;
      if (choice !== "" && choice !== "ignore" && choice !== "noname" && !input.allowedUserIds.has(choice)) continue;
      const next = choiceState(choice);
      if (currentChoice(row) === choice) continue;
      changed += 1;

      if (remember && next.status !== "UNRESOLVED") {
        remembered += 1;
        const notAName = next.status === "NOT_A_NAME";
        await tx.praesidiumShiftAlias.upsert({
          where: { nameKey },
          create: { nameKey, label: row.label, userId: next.userId, notAName, updatedById: input.actorId },
          update: { userId: next.userId, notAName, updatedById: input.actorId },
        });
        await tx.praesidiumShiftListName.update({
          where: { listId_nameKey: { listId: input.listId, nameKey } },
          data: { ...next, source: "ALIAS" },
        });
        await propagateAlias(tx, nameKey, { userId: next.userId, notAName }, input.listId);
      } else {
        await tx.praesidiumShiftListName.update({
          where: { listId_nameKey: { listId: input.listId, nameKey } },
          data: { ...next, source: next.status === "UNRESOLVED" ? "NONE" : "MANUAL" },
        });
      }
    }
  });
  return { changed, remembered };
}

/** Bijnaam toevoegen of wijzigen vanuit het bijnamenscherm. */
export async function saveAlias(input: {
  nameKey: string;
  label: string;
  userId: string | null;
  /** Met een lege `userId`: geen persoon (post, taak) in plaats van geen praesidium. */
  notAName: boolean;
  actorId: string;
}) {
  const notAName = !input.userId && input.notAName;
  await prisma.$transaction(async (tx) => {
    await tx.praesidiumShiftAlias.upsert({
      where: { nameKey: input.nameKey },
      create: { nameKey: input.nameKey, label: input.label, userId: input.userId, notAName, updatedById: input.actorId },
      update: { userId: input.userId, notAName, updatedById: input.actorId },
    });
    await propagateAlias(tx, input.nameKey, { userId: input.userId, notAName });
  });
}

/**
 * Bijnaam vergeten. De lijsten die hem volgden, krijgen opnieuw het voorstel
 * dat ze zonder bijnaam zouden krijgen; met de hand gekozen namen blijven.
 */
export async function deleteAlias(nameKey: string): Promise<number> {
  const rows = await prisma.praesidiumShiftListName.findMany({
    where: { nameKey, source: "ALIAS" },
    select: { listId: true, list: { select: { year: true } } },
  });
  await prisma.praesidiumShiftAlias.deleteMany({ where: { nameKey } });
  const aliases = await loadAliasMap();
  const rosters = new Map<number, RosterMember[]>();
  for (const row of rows) {
    if (!rosters.has(row.list.year)) rosters.set(row.list.year, await loadRoster(row.list.year));
  }
  const kringen = await prisma.praesidiumShiftContact.findMany({
    where: { nameKey, listId: { in: rows.map((r) => r.listId) } },
    select: { listId: true, kring: true },
  });
  await prisma.$transaction(
    rows.map((row) => {
      const kring = kringen.find((k) => k.listId === row.listId && k.kring && !/^\s*vtk\s*$/i.test(k.kring))?.kring;
      const proposal = proposeMatch(
        nameKey,
        rosters.get(row.list.year) ?? [],
        aliases,
        kring ? new Map([[nameKey, kring]]) : new Map(),
      );
      return prisma.praesidiumShiftListName.update({
        where: { listId_nameKey: { listId: row.listId, nameKey } },
        data: { status: proposal.status, source: proposal.source, userId: proposal.userId },
      });
    }),
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Lijsten ophalen
// ---------------------------------------------------------------------------

export function toStatsList(list: {
  id: string;
  kind: ListKind;
  name: string;
  eventDate: Date | null;
  expectedPerMember: number | null;
  countMode: CountMode;
  hoursPerShift: number;
  sheets: Prisma.JsonValue;
  colors: Prisma.JsonValue;
}): StatsList {
  return {
    id: list.id,
    kind: list.kind,
    name: list.name,
    eventDate: list.eventDate,
    expectedPerMember: list.expectedPerMember,
    countMode: list.countMode,
    hoursPerShift: list.hoursPerShift,
    sheets: (list.sheets ?? []) as SheetSetting[],
    colors: (list.colors ?? []) as ColorSetting[],
  };
}

export const LIST_SELECT = {
  id: true,
  kind: true,
  status: true,
  year: true,
  name: true,
  eventDate: true,
  expectedPerMember: true,
  countMode: true,
  hoursPerShift: true,
  openSlots: true,
  fileName: true,
  sheets: true,
  colors: true,
  slots: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Alle lijsten van een jaar met hun vakjes en keuzes, voor de stand. */
export async function loadYearLists(year: number, kind?: ListKind) {
  const lists = await prisma.praesidiumShiftList.findMany({
    where: { year, ...(kind ? { kind } : {}) },
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    select: LIST_SELECT,
  });
  const ids = lists.map((l) => l.id);
  const [entries, names, exemptions, cells] = await Promise.all([
    prisma.praesidiumShiftEntry.findMany({
      where: { listId: { in: ids } },
      select: {
        listId: true,
        nameKey: true,
        sheet: true,
        cell: true,
        color: true,
        hours: true,
        excluded: true,
        date: true,
        role: true,
        slot: true,
        rawName: true,
        note: true,
      },
    }),
    prisma.praesidiumShiftListName.findMany({
      where: { listId: { in: ids } },
      select: { listId: true, nameKey: true, label: true, status: true, source: true, userId: true },
    }),
    prisma.praesidiumShiftExemption.findMany({
      where: { listId: { in: ids } },
      select: { listId: true, userId: true, reason: true },
    }),
    loadCellOverrides(ids),
  ]);
  return { lists, entries: attachOverrides(entries, cells), names, exemptions };
}

/** De keuzes per vakje van een of meer lijsten, om met `attachOverrides` aan de vakjes te hangen. */
export async function loadCellOverrides(listIds: string[]) {
  if (listIds.length === 0) return [];
  return prisma.praesidiumShiftCellOverride.findMany({
    where: { listId: { in: listIds } },
    select: { listId: true, sheet: true, cell: true, nameKey: true, userId: true },
  });
}

/**
 * Eén vakje met de hand regelen: `null` telt voor niemand, een id telt voor
 * dat praesidiumlid, `"follow"` volgt weer de naam. Een keuze die gelijk is aan
 * wat de naam al zegt, wordt niet bewaard: dan zou ze een latere correctie van
 * de naam stil tegenhouden.
 */
export async function setCellOverride(input: {
  listId: string;
  year: number;
  sheet: string;
  cell: string;
  nameKey: string;
  target: string | null | "follow";
  actorId: string;
}): Promise<"saved" | "cleared" | "not-found" | "not-member"> {
  const where = { listId: input.listId, sheet: input.sheet, cell: input.cell, nameKey: input.nameKey };
  const entry = await prisma.praesidiumShiftEntry.findFirst({
    where,
    select: { role: true, slot: true, date: true },
  });
  if (!entry) return "not-found";
  const id = { listId_sheet_cell_nameKey: where };

  if (input.target !== null && input.target !== "follow") {
    const roster = await loadRoster(input.year);
    if (!roster.some((m) => m.userId === input.target)) return "not-member";
    const name = await prisma.praesidiumShiftListName.findUnique({
      where: { listId_nameKey: { listId: input.listId, nameKey: input.nameKey } },
      select: { status: true, userId: true },
    });
    if (name?.status === "MATCHED" && name.userId === input.target) input = { ...input, target: "follow" };
  }
  if (input.target === "follow") {
    await prisma.praesidiumShiftCellOverride.deleteMany({ where });
    return "cleared";
  }
  await prisma.praesidiumShiftCellOverride.upsert({
    where: id,
    create: { ...where, ...entry, userId: input.target, updatedById: input.actorId },
    update: { ...entry, userId: input.target, updatedById: input.actorId },
  });
  return "saved";
}

/**
 * Iemand op één lijst overslaan, of weer laten meetellen. Enkel wie in het
 * werkingsjaar van de lijst in het praesidium zit; een ander id wordt stil
 * genegeerd (de keuzelijst biedt het niet aan).
 */
export async function setExemption(input: {
  listId: string;
  year: number;
  userIds: string[];
  skip: boolean;
  reason: string | null;
  actorId: string;
}): Promise<number> {
  if (!input.skip) {
    const { count } = await prisma.praesidiumShiftExemption.deleteMany({
      where: { listId: input.listId, userId: { in: input.userIds } },
    });
    return count;
  }
  const roster = new Set((await loadRoster(input.year)).map((m) => m.userId));
  const userIds = input.userIds.filter((id) => roster.has(id));
  const { count } = await prisma.praesidiumShiftExemption.createMany({
    data: userIds.map((userId) => ({ listId: input.listId, userId, reason: input.reason, createdById: input.actorId })),
    skipDuplicates: true,
  });
  return count;
}

/** Een nummer uit het overzicht van een lijst, voor wie er op zijn profiel geen heeft. */
export async function listPhones(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const contacts = await prisma.praesidiumShiftContact.findMany({
    where: { userId: { in: userIds }, phone: { not: null } },
    orderBy: { list: { createdAt: "desc" } },
    select: { userId: true, phone: true },
  });
  const phones = new Map<string, string>();
  for (const contact of contacts) {
    if (contact.userId && contact.phone && !phones.has(contact.userId)) phones.set(contact.userId, contact.phone);
  }
  return phones;
}

// ---------------------------------------------------------------------------
// Shiften op /shift
// ---------------------------------------------------------------------------

export function yearRange(year: number) {
  return { gte: workingYearStart(year), lt: workingYearStart(year + 1) };
}

/**
 * De inschrijvingen van praesidiumleden op /shift in een werkingsjaar, met of
 * ze uit noodzaak waren. Manuele toekenningen (overdracht van de vorige site)
 * tellen niet: dat zijn geen shiften die iemand dit jaar opnam.
 */
export async function loadSiteParticipations(year: number, userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.shiftParticipant.findMany({
    where: {
      userId: { in: userIds },
      shift: { startTime: yearRange(year), manualGrantId: null },
    },
    orderBy: { shift: { startTime: "desc" } },
    select: {
      shiftId: true,
      userId: true,
      registeredAt: true,
      praesidiumNecessity: { select: { createdAt: true } },
      shift: {
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          post: true,
          maxParticipants: true,
          _count: { select: { participants: true } },
        },
      },
    },
  });
}

export async function setNecessity(input: {
  shiftId: string;
  userIds: string[];
  necessary: boolean;
  actorId: string;
}): Promise<number> {
  if (input.userIds.length === 0) return 0;
  if (!input.necessary) {
    const { count } = await prisma.praesidiumShiftNecessity.deleteMany({
      where: { shiftId: input.shiftId, userId: { in: input.userIds } },
    });
    return count;
  }
  // Enkel bestaande inschrijvingen: de relatie met ShiftParticipant zou een
  // vreemde combinatie toch weigeren, maar dan als serverfout.
  const participants = await prisma.shiftParticipant.findMany({
    where: { shiftId: input.shiftId, userId: { in: input.userIds } },
    select: { userId: true },
  });
  const { count } = await prisma.praesidiumShiftNecessity.createMany({
    data: participants.map((p) => ({ shiftId: input.shiftId, userId: p.userId, markedById: input.actorId })),
    skipDuplicates: true,
  });
  return count;
}

export type { SlotStat };
