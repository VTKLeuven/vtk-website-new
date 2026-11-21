import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import writeXlsxFile from "write-excel-file/node";

/*
 * De scan van de BO-map, tegen een nagebootste Drive en een database in het
 * geheugen. De mapstructuur volgt die van 26-27: snelkoppelingen naar de
 * rekenbladen van de posten, een snelkoppeling naar de map van een werkgroep,
 * een agenda en een verslag die niet meetellen.
 */

type FakeFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  createdTime?: string;
  modifiedTime?: string;
  shortcutDetails?: { targetId: string; targetMimeType?: string };
};

const FOLDER = "application/vnd.google-apps.folder";
const SHORTCUT = "application/vnd.google-apps.shortcut";
const SHEET = "application/vnd.google-apps.spreadsheet";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOC = "application/vnd.google-apps.document";

const drive = new Map<string, FakeFile>();
const downloads: string[] = [];
const docDownloads: string[] = [];
let overviewBuffer: Buffer;

/** Een docx met enkel `word/document.xml`, ongecomprimeerd: genoeg voor de lezer. */
function docx(xml: string): Buffer {
  const name = Buffer.from("word/document.xml");
  const data = Buffer.from(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

const run = (text: string, color?: string) =>
  `<w:r><w:rPr>${color ? `<w:color w:val="${color}"/>` : ""}</w:rPr><w:t>${text}</w:t></w:r>`;
const MINUTES = docx(
  `<w:document><w:body>${[
    run("VERSLAG"),
    run("BO 5 - 20/09/2026"),
    run("Aanwezigheden"),
    run("Ada Peeters", "6aa84f"),
    run("Bram Claes", "cc0000"),
  ]
    .map((r) => `<w:p>${r}</w:p>`)
    .join("")}</w:body></w:document>`,
);

vi.mock("@/lib/google/config", () => ({
  getGoogleConfig: async () => ({
    domain: "vtk.be",
    subject: "it@vtk.be",
    clientEmail: "sa@example.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----",
    oauth: null,
    fullOrgUnit: "/",
    restrictedOrgUnit: null,
    driveSubject: "bo@vtk.be",
  }),
}));

vi.mock("@/lib/google/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google/client")>();
  return {
    ...actual,
    listDriveChildren: async (_cfg: unknown, _subject: string, folderId: string) =>
      [...drive.values()].filter((f) => f.parents.includes(folderId)),
    getDriveFile: async (_cfg: unknown, _subject: string, id: string) => drive.get(id) ?? null,
    downloadSpreadsheet: async (_cfg: unknown, _subject: string, file: { id: string }) => {
      downloads.push(file.id);
      return overviewBuffer;
    },
    downloadDocument: async (_cfg: unknown, _subject: string, file: { id: string }) => {
      docDownloads.push(file.id);
      return MINUTES;
    },
  };
});

// Een database in het geheugen, met enkel wat de scan gebruikt.
type Row = Record<string, unknown> & { id: string };
const meetings = new Map<string, Row>();
const documents = new Map<string, Row>();
const minutes = new Map<string, Row>();
const settings = new Map<string, unknown>();
let ids = 0;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === "object" && "notIn" in condition) {
      return !(condition.notIn as unknown[]).includes(row[key]);
    }
    if (condition instanceof Date) return (row[key] as Date | null)?.getTime() === condition.getTime();
    return row[key] === condition;
  });
}

vi.mock("@vtk/db", () => ({
  prisma: {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
        settings.set(where.key, create.value);
      },
    },
    boMeeting: {
      upsert: async ({ where, create, update }: { where: { driveFolderId: string }; create: Row; update: Row }) => {
        const existing = [...meetings.values()].find((m) => m.driveFolderId === where.driveFolderId);
        if (existing) return Object.assign(existing, update);
        const row = { ...create, id: `m${++ids}`, missingSince: null };
        meetings.set(row.id, row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        for (const row of meetings.values()) if (matches(row, where)) Object.assign(row, data);
      },
    },
    boDocument: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        [...documents.values()].filter((row) => matches(row, where)),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        [...documents.values()].find((row) => matches(row, where)) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { meetingId_driveFileId: { meetingId: string; driveFileId: string } };
        create: Row;
        update: Row;
      }) => {
        const { meetingId, driveFileId } = where.meetingId_driveFileId;
        const existing = [...documents.values()].find((d) => d.meetingId === meetingId && d.driveFileId === driveFileId);
        if (existing) return Object.assign(existing, update);
        const row = { figuresReadFor: null, ...create, id: `d${++ids}` };
        documents.set(row.id, row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        for (const row of documents.values()) if (matches(row, where)) Object.assign(row, data);
      },
    },
    boMinutes: {
      findUnique: async ({ where }: { where: { meetingId: string } }) => minutes.get(where.meetingId) ?? null,
      upsert: async ({ where, create, update }: { where: { meetingId: string }; create: Row; update: Row }) => {
        const existing = minutes.get(where.meetingId);
        if (existing) return Object.assign(existing, update);
        const row = { ...create, id: `v${++ids}` };
        minutes.set(where.meetingId, row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        for (const row of minutes.values()) if (matches(row, where)) Object.assign(row, data);
      },
    },
  },
}));

const { scanBestuursorgaan } = await import("@/lib/bo/scan");

function add(file: FakeFile) {
  drive.set(file.id, { modifiedTime: "2026-09-18T10:00:00.000Z", createdTime: "2026-09-17T10:00:00.000Z", ...file });
}

function shortcut(id: string, name: string, parent: string, targetId: string, targetMimeType: string) {
  add({ id, name, mimeType: SHORTCUT, parents: [parent], shortcutDetails: { targetId, targetMimeType } });
}

async function overviewSheet(): Promise<Buffer> {
  const t = (value: string) => ({ value, type: String });
  const n = (value: number) => ({ value, type: Number });
  const data = [
    [t("Theokot"), null, t("Frigo")],
    [],
    [],
    [t("Overzicht"), null, t("Budget"), t("Resultaat")],
    [],
    [],
    [],
    [],
    [],
    [t("Inkomsten"), null, n(0), n(0)],
    [t("Uitgaven"), null, n(450), n(0)],
    [t("Totaal"), null, n(-450), n(0)],
    [t("Begroting"), null, n(-500), n(-500)],
  ];
  return Buffer.from(await writeXlsxFile([{ sheet: "Blad1", data }] as never).toBuffer());
}

function docsIn(meetingName: string) {
  const meeting = [...meetings.values()].find((m) => m.name === meetingName)!;
  return [...documents.values()].filter((d) => d.meetingId === meeting.id);
}

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z"), toFake: ["Date"] });
  drive.clear();
  meetings.clear();
  documents.clear();
  minutes.clear();
  settings.clear();
  downloads.length = 0;
  docDownloads.length = 0;
  overviewBuffer = await overviewSheet();
  settings.set("bestuursorgaan.config", { rootFolderId: "praesidium", yearFolderIds: {} });

  add({ id: "y26", name: "2026 - 2027 Tortubois", mimeType: FOLDER, parents: ["praesidium"] });
  add({ id: "bo26", name: "Bestuursorgaan", mimeType: FOLDER, parents: ["y26"] });
  add({ id: "m5", name: "BO 5 - 20/09", mimeType: FOLDER, parents: ["bo26"] });
  add({ id: "m7", name: "BO 7 - 04/10", mimeType: FOLDER, parents: ["bo26"], createdTime: "2026-09-30T10:00:00.000Z" });
  add({ id: "sg", name: "Schriftelijke goedkeuring", mimeType: FOLDER, parents: ["bo26"] });
  add({ id: "tpl", name: "Sjablonen", mimeType: FOLDER, parents: ["bo26"] });

  // BO 5: Budgetten met snelkoppelingen, Resultaten leeg, agenda en verslag ernaast.
  add({ id: "m5b", name: "Budgetten", mimeType: FOLDER, parents: ["m5"] });
  add({ id: "m5r", name: "Resultaten", mimeType: FOLDER, parents: ["m5"] });
  add({ id: "agenda", name: "AGENDA_BO_5", mimeType: DOC, parents: ["m5"] });
  add({ id: "verslag-doc", name: "VERSLAG_BO_5", mimeType: DOC, parents: ["elders"] });
  shortcut("verslag", "VERSLAG_BO_5", "m5", "verslag-doc", DOC);

  add({ id: "frigo", name: "26-27_Budget_Theokot_Frigo", mimeType: SHEET, parents: ["theokot-drive"] });
  shortcut("frigo-sc", "26-27_Budget_Theokot_Frigo", "m5b", "frigo", SHEET);
  add({ id: "offerte", name: "offerte karting.pdf", mimeType: "application/pdf", parents: ["m5b"] });
  shortcut("geheim-sc", "26-27_Budget_Sport_VTKlimmen", "m5b", "geheim", SHEET);

  // De werkgroep hangt haar eigen map in Budgetten.
  add({ id: "statix-bo5", name: "BO 5 - 20/9", mimeType: FOLDER, parents: ["statix-drive"] });
  shortcut("statix-sc", "Budgetten", "m5b", "statix-bo5", FOLDER);
  add({ id: "ontbijt", name: "26-27_Budget_Statix_Ontbijt .xlsx", mimeType: XLSX, parents: ["statix-bo5"] });
  // Een naam zonder soort in Resultaten: de map beslist.
  add({ id: "ecc", name: "26-27_Development_ECC.xlsx", mimeType: XLSX, parents: ["m5r"] });

  // BO 7 en de schriftelijke goedkeuring.
  add({ id: "m7r", name: "Resultaten", mimeType: FOLDER, parents: ["m7"] });
  add({ id: "frigo-res", name: "26-27_Resultaat_Theokot_Frigo", mimeType: SHEET, parents: ["m7r"] });
  add({ id: "router", name: "26-27_Budget_IT_Router", mimeType: SHEET, parents: ["sg"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("de BO-map lezen", () => {
  it("vindt de vergaderingen en wat erin passeerde", async () => {
    const outcome = await scanBestuursorgaan();
    if (!("status" in outcome)) throw new Error(outcome.skipped);
    expect(outcome.status.error).toBeNull();
    expect(outcome.status.skippedFolders).toEqual(["Sjablonen"]);
    expect(outcome.status.years).toEqual([
      { year: 2026, folderId: "bo26", folderName: "Bestuursorgaan", meetings: 3, documents: 6 },
      { year: 2025, folderId: null, folderName: null, meetings: 0, documents: 0 },
    ]);

    const bo5 = [...meetings.values()].find((m) => m.name === "BO 5 - 20/09")!;
    expect(bo5).toMatchObject({ kind: "MEETING", number: 5, workingYear: 2026 });
    expect((bo5.date as Date).toISOString().slice(0, 10)).toBe("2026-09-20");
    expect([...meetings.values()].find((m) => m.name === "Schriftelijke goedkeuring")).toMatchObject({ kind: "WRITTEN" });

    const inBo5 = Object.fromEntries(docsIn("BO 5 - 20/09").map((d) => [d.driveFileId, d]));
    // De agenda, het verslag en de offerte tellen niet.
    expect(Object.keys(inBo5).sort()).toEqual(["ecc", "frigo", "geheim", "ontbijt"]);
    expect(inBo5.frigo).toMatchObject({ folderKind: "BUDGET", budgetTotalCents: -45000, allocationCents: -50000, figuresError: null });
    expect(inBo5.ontbijt).toMatchObject({ folderKind: "BUDGET", figuresError: null });
    expect(inBo5.ecc).toMatchObject({ folderKind: "RESULT" });
    // De snelkoppeling waarvan het doel niet te openen is, staat er toch, met de reden.
    expect(inBo5.geheim).toMatchObject({ name: "26-27_Budget_Sport_VTKlimmen", figuresError: "NO_ACCESS", figuresReadFor: null });
    expect(outcome.status.unreachable).toEqual(["26-27_Budget_Sport_VTKlimmen"]);

    expect(docsIn("BO 7 - 04/10").map((d) => d.driveFileId)).toEqual(["frigo-res"]);
    expect(docsIn("Schriftelijke goedkeuring").map((d) => d.driveFileId)).toEqual(["router"]);
    // Vijf rekenbladen en het verslag van BO 5.
    expect(outcome.status.read).toBe(6);
  });

  it("leest het verslag van een BO via de snelkoppeling, en niet opnieuw zolang het niet wijzigt", async () => {
    await scanBestuursorgaan();
    const bo5 = [...meetings.values()].find((m) => m.name === "BO 5 - 20/09")!;
    const bo7 = [...meetings.values()].find((m) => m.name === "BO 7 - 04/10")!;
    expect(minutes.get(bo5.id as string)).toMatchObject({
      driveFileId: "verslag-doc",
      name: "VERSLAG_BO_5",
      error: null,
      title: "BO 5 - 20/09/2026",
      attendance: [
        { name: "Ada Peeters", status: "PRESENT", color: "6aa84f" },
        { name: "Bram Claes", status: "ABSENT", color: "cc0000" },
      ],
    });
    // De agenda is geen verslag, en BO 7 heeft er geen.
    expect(docDownloads).toEqual(["verslag-doc"]);
    expect(minutes.has(bo7.id as string)).toBe(false);

    await scanBestuursorgaan();
    expect(docDownloads).toEqual(["verslag-doc"]);

    // Weg uit de map: de aanwezigheden blijven, met `missingSince`.
    drive.delete("verslag");
    await scanBestuursorgaan();
    expect(minutes.get(bo5.id as string)).toMatchObject({ missingSince: expect.any(Date), error: null });
  });

  it("downloadt een ongewijzigd rekenblad niet opnieuw, en onthoudt wat verdween", async () => {
    await scanBestuursorgaan();
    downloads.length = 0;
    drive.delete("ontbijt");
    drive.set("frigo", { ...drive.get("frigo")!, modifiedTime: "2026-10-01T10:00:00.000Z" });

    const outcome = await scanBestuursorgaan();
    if (!("status" in outcome)) throw new Error(outcome.skipped);
    expect(downloads).toEqual(["frigo"]);

    const inBo5 = Object.fromEntries(docsIn("BO 5 - 20/09").map((d) => [d.driveFileId, d]));
    expect(inBo5.ontbijt.missingSince).toBeInstanceOf(Date);
    expect(inBo5.frigo.missingSince).toBeNull();
  });

  it("leest een budget dat in twee BO's staat maar één keer", async () => {
    shortcut("frigo-sc7", "26-27_Budget_Theokot_Frigo", "m7r", "frigo", SHEET);
    await scanBestuursorgaan();
    expect(downloads.filter((id) => id === "frigo")).toHaveLength(1);
    expect(docsIn("BO 7 - 04/10").map((d) => d.driveFileId).sort()).toEqual(["frigo", "frigo-res"]);
  });

  it("bewaart de naam van de snelkoppeling naast die van het blad", async () => {
    // De post vulde het resultaat in het budgetblad in, hernoemde het en hing
    // het in de Resultaten van BO 7. De snelkoppeling in BO 5 heet nog Budget.
    drive.set("frigo", { ...drive.get("frigo")!, name: "26-27_Resultaat_Theokot_Frigo" });
    shortcut("frigo-sc7", "26-27_Resultaat_Theokot_Frigo", "m7r", "frigo", SHEET);
    await scanBestuursorgaan();

    const inBo5 = docsIn("BO 5 - 20/09").find((d) => d.driveFileId === "frigo");
    const inBo7 = docsIn("BO 7 - 04/10").find((d) => d.driveFileId === "frigo");
    expect(inBo5).toMatchObject({ name: "26-27_Resultaat_Theokot_Frigo", linkName: "26-27_Budget_Theokot_Frigo", folderKind: "BUDGET" });
    expect(inBo7).toMatchObject({ name: "26-27_Resultaat_Theokot_Frigo", linkName: "26-27_Resultaat_Theokot_Frigo", folderKind: "RESULT" });
    // Een bestand dat er zelf in staat, heeft geen snelkoppeling.
    expect(docsIn("BO 7 - 04/10").find((d) => d.driveFileId === "frigo-res")).toMatchObject({ linkName: null });
  });

  it("slaat over zolang er geen map ingesteld is", async () => {
    settings.set("bestuursorgaan.config", { rootFolderId: null, yearFolderIds: {} });
    expect(await scanBestuursorgaan()).toEqual({ skipped: "NO_FOLDER" });
  });
});
