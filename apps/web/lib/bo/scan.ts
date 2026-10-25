import "server-only";

import { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@/lib/workingYear";
import { getGoogleConfig, type GoogleConfig } from "@/lib/google/config";
import {
  DRIVE_FOLDER_MIME,
  DRIVE_SHEET_MIME,
  DRIVE_SHORTCUT_MIME,
  GoogleError,
  XLSX_MIME,
  downloadSpreadsheet,
  getDriveFile,
  listDriveChildren,
  type DriveFile,
} from "@/lib/google/client";
import { figuresFromXlsx, type BoLine, type Figures } from "./figures";
import {
  folderKind,
  isBoRootFolderName,
  parseDocumentName,
  parseMeetingFolderName,
  parseYearFolderName,
  resolveMeetingDate,
  type BoKind,
} from "./names";
import { getBoConfig, getScanStatus, saveScanStatus, type BoConfig, type BoScanStatus } from "./settings";

/*
 * De BO-map lezen en in `BoMeeting`/`BoDocument` zetten.
 *
 * De structuur, van boven naar onder:
 *
 *   Praesidium (gedeelde drive)
 *   └── 2026 - 2027 Tortubois
 *       └── Bestuursorgaan
 *           ├── BO 5 - 20/09
 *           │   ├── Budgetten
 *           │   │   ├── 26-27_Budget_Theokot_Frigo        (snelkoppeling)
 *           │   │   └── Budgetten                         (snelkoppeling naar de map
 *           │   │                                           van een werkgroep)
 *           │   └── Resultaten
 *           └── Schriftelijke goedkeuring
 *
 * Twee dingen bepalen hoe dit leest:
 *
 * - **Bijna alles is een snelkoppeling.** De posten zetten hun rekenblad in hun
 *   eigen map en hangen er een snelkoppeling van in de BO-map; een werkgroep
 *   hangt er een hele map in. We volgen beide, en bewaren het doel: dat is het
 *   bestand waarvan we de bedragen lezen. De naam van de snelkoppeling
 *   bewaren we ernaast (`linkName`): die blijft "Budget" heten wanneer de post
 *   het blad later tot resultaat hernoemt.
 * - **De BO is de map in de hoofdboom waarlangs we het bestand vonden**, niet
 *   de map waar het echt staat. De map van een werkgroep heet "BO 7 - 4/10"
 *   terwijl de hoofdmap "BO 7 - 04/10" heet; dat maakt dan niet uit.
 *
 * Wat de scan niet meer vindt, wordt niet gewist maar krijgt `missingSince`:
 * het overzicht is een register van wat er langs het BO passeerde.
 */

/** Hoe diep de scan onder een vergadering in mappen afdaalt. */
const MAX_DEPTH = 4;
/** Een budget is een paar honderd kB; wat veel groter is, heeft foto's in. */
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
/** De worker roept elke vijf minuten; zo vaak hoeft de BO-map niet. */
export const SCAN_INTERVAL_MS = 30 * 60 * 1000;

const SPREADSHEET_MIMES = new Set([DRIVE_SHEET_MIME, XLSX_MIME]);
const OTHER_SHEET_MIMES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
]);

export type ScanSkip = "NOT_CONFIGURED" | "NO_DRIVE_ACCOUNT" | "NO_FOLDER" | "NOT_DUE";

export type ScanOutcome = { skipped: ScanSkip } | { status: BoScanStatus };

type Found = {
  file: DriveFile;
  folderKind: BoKind | null;
  /**
   * De naam van de snelkoppeling waarlangs we het bestand vonden. Hernoemt een
   * post haar budget later tot resultaat, dan blijft deze naam staan: zo weten
   * we wat het op die BO was.
   */
  linkName?: string;
  /** Gezet wanneer het account het doel van een snelkoppeling niet kan openen. */
  unreachable?: boolean;
};

type FigureFields = Omit<Figures, "lines"> & {
  lines: BoLine[] | null;
  figuresError: string | null;
  figuresReadFor: Date | null;
};

const NO_FIGURES: Omit<FigureFields, "figuresError" | "figuresReadFor"> = {
  sheetPost: null,
  sheetTitle: null,
  eventDate: null,
  budgetIncomeCents: null,
  budgetExpenseCents: null,
  budgetTotalCents: null,
  resultIncomeCents: null,
  resultExpenseCents: null,
  resultTotalCents: null,
  allocationCents: null,
  vtkSharePercent: null,
  lines: null,
  location: null,
};

const FIGURE_SELECT = {
  sheetPost: true,
  sheetTitle: true,
  eventDate: true,
  budgetIncomeCents: true,
  budgetExpenseCents: true,
  budgetTotalCents: true,
  resultIncomeCents: true,
  resultExpenseCents: true,
  resultTotalCents: true,
  allocationCents: true,
  vtkSharePercent: true,
  lines: true,
  location: true,
} as const;

class Scan {
  readonly status: BoScanStatus;
  /** Eén download per bestand per scan, ook als het in twee BO's staat. */
  private readonly figures = new Map<string, FigureFields>();

  constructor(
    private readonly cfg: GoogleConfig,
    private readonly subject: string,
    private readonly config: BoConfig,
    private readonly now: Date,
  ) {
    this.status = {
      startedAt: now.toISOString(),
      finishedAt: null,
      error: null,
      years: [],
      skippedFolders: [],
      unreachable: [],
      read: 0,
      failed: [],
    };
  }

  private list(folderId: string) {
    return listDriveChildren(this.cfg, this.subject, folderId);
  }

  /**
   * De map Bestuursorgaan van een werkingsjaar: de ingestelde, of anders
   * "2026 - 2027 ..." in de wortel en daarin "Bestuursorgaan".
   */
  async findYearFolder(year: number, rootChildren: DriveFile[] | null): Promise<DriveFile | null> {
    const override = this.config.yearFolderIds[String(year)];
    if (override) return getDriveFile(this.cfg, this.subject, override);
    if (!rootChildren) return null;

    const yearFolder = (await this.folders(rootChildren)).find((f) => parseYearFolderName(f.name) === year);
    if (!yearFolder) return null;
    const inside = await this.folders(await this.list(yearFolder.id));
    return inside.find((f) => isBoRootFolderName(f.name)) ?? null;
  }

  /** De mappen in een lijst, met een snelkoppeling naar een map als die map. */
  private async folders(children: DriveFile[]): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    for (const child of children) {
      if (child.mimeType === DRIVE_FOLDER_MIME) out.push(child);
      else if (
        child.mimeType === DRIVE_SHORTCUT_MIME &&
        child.shortcutDetails?.targetMimeType === DRIVE_FOLDER_MIME
      ) {
        out.push({ ...child, id: child.shortcutDetails.targetId, mimeType: DRIVE_FOLDER_MIME });
      }
    }
    return out;
  }

  async scanYear(year: number, boFolder: DriveFile): Promise<void> {
    const seen: string[] = [];
    let documents = 0;

    for (const folder of await this.folders(await this.list(boFolder.id))) {
      const parsed = parseMeetingFolderName(folder.name);
      if (!parsed) {
        this.status.skippedFolders.push(folder.name);
        continue;
      }
      const createdAt = folder.createdTime ? new Date(folder.createdTime) : null;
      const date =
        parsed.day !== null && parsed.month !== null
          ? resolveMeetingDate(parsed.day, parsed.month, year, createdAt)
          : null;
      const fields = {
        workingYear: year,
        name: folder.name,
        kind: parsed.kind,
        number: parsed.number,
        date,
        webUrl: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`,
        missingSince: null,
      };
      const meeting = await prisma.boMeeting.upsert({
        where: { driveFolderId: folder.id },
        create: { driveFolderId: folder.id, ...fields },
        update: fields,
      });
      seen.push(folder.id);

      const found = new Map<string, Found>();
      await this.walk(folder.id, null, 0, new Set(), found);
      await this.syncDocuments(meeting.id, [...found.values()]);
      documents += found.size;
    }

    await prisma.boMeeting.updateMany({
      where: { workingYear: year, driveFolderId: { notIn: seen }, missingSince: null },
      data: { missingSince: this.now },
    });
    this.status.years.push({
      year,
      folderId: boFolder.id,
      folderName: boFolder.name,
      meetings: seen.length,
      documents,
    });
  }

  /** Alles onder een vergadering wat een budget of resultaat is. */
  private async walk(
    folderId: string,
    kind: BoKind | null,
    depth: number,
    visited: Set<string>,
    out: Map<string, Found>,
  ): Promise<void> {
    if (depth > MAX_DEPTH || visited.has(folderId)) return;
    visited.add(folderId);

    for (const child of await this.list(folderId)) {
      if (child.mimeType === DRIVE_FOLDER_MIME) {
        await this.walk(child.id, folderKind(child.name) ?? kind, depth + 1, visited, out);
        continue;
      }

      if (child.mimeType === DRIVE_SHORTCUT_MIME) {
        const targetId = child.shortcutDetails?.targetId;
        if (!targetId) continue;
        const target = await getDriveFile(this.cfg, this.subject, targetId);
        if (!target) {
          // Het doel bestaat niet meer, of het account kan er niet bij. Een
          // budget of resultaat registreren we toch, zodat het BO ziet dat het
          // er is; het overzicht zegt dan met wie het gedeeld moet worden.
          this.status.unreachable.push(child.name);
          const isFolder = child.shortcutDetails?.targetMimeType === DRIVE_FOLDER_MIME;
          if (!isFolder && (parseDocumentName(child.name).kind || kind) && !out.has(targetId)) {
            out.set(targetId, {
              file: {
                ...child,
                id: targetId,
                mimeType: child.shortcutDetails?.targetMimeType ?? child.mimeType,
                webViewLink: `https://drive.google.com/file/d/${targetId}/view`,
              },
              folderKind: kind,
              linkName: child.name,
              unreachable: true,
            });
          }
          continue;
        }
        if (target.mimeType === DRIVE_FOLDER_MIME) {
          // De snelkoppeling naar de map van een werkgroep heet "Budgetten" of
          // "Resultaten", de map zelf soms anders; de koppeling zegt het meest.
          await this.walk(target.id, folderKind(child.name) ?? folderKind(target.name) ?? kind, depth + 1, visited, out);
          continue;
        }
        this.collect(target, kind, out, child.name);
        continue;
      }

      this.collect(child, kind, out);
    }
  }

  /**
   * Een bestand telt wanneer de naam zegt dat het een budget of resultaat is,
   * of wanneer het een rekenblad in Budgetten of Resultaten is. Een offerte
   * als pdf in die map, de agenda en het verslag tellen niet.
   */
  private collect(file: DriveFile, kind: BoKind | null, out: Map<string, Found>, linkName?: string): void {
    if (out.has(file.id)) return;
    const named = parseDocumentName(linkName ?? "").kind ?? parseDocumentName(file.name).kind;
    const isSheet = SPREADSHEET_MIMES.has(file.mimeType) || OTHER_SHEET_MIMES.has(file.mimeType);
    if (!named && !(kind && isSheet)) return;
    out.set(file.id, { file, folderKind: kind, linkName });
  }

  private async syncDocuments(meetingId: string, found: Found[]): Promise<void> {
    const existing = await prisma.boDocument.findMany({
      where: { meetingId },
      select: { driveFileId: true, figuresReadFor: true },
    });
    const readFor = new Map(existing.map((d) => [d.driveFileId, d.figuresReadFor]));

    for (const item of found) {
      const modified = item.file.modifiedTime ? new Date(item.file.modifiedTime) : this.now;
      const previous = readFor.get(item.file.id);
      const fresh = previous && previous.getTime() === modified.getTime();
      const figures = fresh ? null : await this.readFigures(item, modified);

      const fields = {
        name: item.file.name,
        linkName: item.linkName ?? null,
        mimeType: item.file.mimeType,
        webUrl: item.file.webViewLink ?? `https://drive.google.com/file/d/${item.file.id}/view`,
        folderKind: item.folderKind,
        driveModifiedAt: modified,
        lastSeenAt: this.now,
        missingSince: null,
        ...(figures
          ? {
              ...figures,
              // Een lege JSON-kolom is `DbNull`, geen `null`.
              lines: figures.lines ? (figures.lines as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            }
          : {}),
      };
      try {
        await prisma.boDocument.upsert({
          where: { meetingId_driveFileId: { meetingId, driveFileId: item.file.id } },
          create: { meetingId, driveFileId: item.file.id, ...fields },
          update: fields,
        });
      } catch (err) {
        // Eén vreemd bestand mag de rest van de BO-map niet tegenhouden. Het
        // staat in de status, en de fout gaat naar de monitoring.
        console.error("[bestuursorgaan] bestand niet bewaard", item.file.name, err);
        Sentry.captureException(err, { extra: { file: item.file.name } });
        this.status.failed?.push(item.file.name);
      }
    }

    await prisma.boDocument.updateMany({
      where: { meetingId, driveFileId: { notIn: found.map((f) => f.file.id) }, missingSince: null },
      data: { missingSince: this.now },
    });
  }

  private async readFigures(item: Found, modified: Date): Promise<FigureFields> {
    const cached = this.figures.get(item.file.id);
    if (cached) return cached;

    // Hetzelfde bestand, ongewijzigd, al gelezen in een andere BO (een budget
    // dat uitgesteld werd): neem die bedragen over in plaats van te downloaden.
    const known = await prisma.boDocument.findFirst({
      where: { driveFileId: item.file.id, figuresReadFor: modified },
      select: { ...FIGURE_SELECT, figuresError: true, figuresReadFor: true },
    });
    if (known) {
      const copy = { ...known, lines: (known.lines as BoLine[] | null) ?? null };
      this.figures.set(item.file.id, copy);
      return copy;
    }

    const fail = (code: string, retry = false): FigureFields => ({
      ...NO_FIGURES,
      figuresError: code,
      // Een tijdelijke fout (Google gaf een 500) proberen we de volgende scan
      // opnieuw; een blijvende (geen rekenblad) niet, tot het bestand wijzigt.
      figuresReadFor: retry ? null : modified,
    });

    let result: FigureFields;
    if (item.unreachable) {
      result = fail("NO_ACCESS", true);
    } else if (!SPREADSHEET_MIMES.has(item.file.mimeType)) {
      result = fail("NOT_SPREADSHEET");
    } else if (Number(item.file.size ?? 0) > MAX_DOWNLOAD_BYTES) {
      result = fail("TOO_LARGE");
    } else {
      try {
        const buffer = await downloadSpreadsheet(this.cfg, this.subject, item.file);
        this.status.read += 1;
        const parsed = figuresFromXlsx(buffer);
        result =
          "error" in parsed
            ? fail(parsed.error)
            : { ...parsed.figures, figuresError: null, figuresReadFor: modified };
      } catch (err) {
        if (!(err instanceof GoogleError)) throw err;
        result = fail(err.status === 403 || err.status === 404 ? "NO_ACCESS" : "DOWNLOAD_FAILED", true);
      }
    }
    this.figures.set(item.file.id, result);
    return result;
  }
}

let running: Promise<ScanOutcome> | null = null;

/**
 * Leest de BO-map nu. Loopt er al een scan (de worker en de knop tegelijk), dan
 * wacht deze op die ene in plaats van alles twee keer te doen.
 */
export function scanBestuursorgaan(): Promise<ScanOutcome> {
  running ??= runScan().finally(() => {
    running = null;
  });
  return running;
}

/** Voor de worker: enkel wanneer de vorige scan lang genoeg geleden is. */
export async function scanBestuursorgaanIfDue(now: Date = new Date()): Promise<ScanOutcome> {
  const last = await getScanStatus();
  if (last && now.getTime() - new Date(last.startedAt).getTime() < SCAN_INTERVAL_MS) {
    return { skipped: "NOT_DUE" };
  }
  return scanBestuursorgaan();
}

async function runScan(): Promise<ScanOutcome> {
  const cfg = await getGoogleConfig();
  if (!cfg) return { skipped: "NOT_CONFIGURED" };
  if (!cfg.driveSubject) return { skipped: "NO_DRIVE_ACCOUNT" };
  const config = await getBoConfig();
  if (!config.rootFolderId && Object.keys(config.yearFolderIds).length === 0) {
    return { skipped: "NO_FOLDER" };
  }

  const scan = new Scan(cfg, cfg.driveSubject, config, new Date());
  try {
    const rootChildren = config.rootFolderId
      ? await listDriveChildren(cfg, cfg.driveSubject, config.rootFolderId)
      : null;
    // Het lopende jaar en het vorige: de resultaten van vorig jaar komen nog
    // binnen in de eerste BO's van het nieuwe, en hun budgetten staan in de
    // map van vorig jaar.
    const current = currentWorkingYear();
    for (const year of [current, current - 1]) {
      const folder = await scan.findYearFolder(year, rootChildren);
      if (folder) await scan.scanYear(year, folder);
      else scan.status.years.push({ year, folderId: null, folderName: null, meetings: 0, documents: 0 });
    }
  } catch (err) {
    scan.status.error = err instanceof Error ? err.message : String(err);
    if (!(err instanceof GoogleError)) {
      console.error("[bestuursorgaan] scan mislukt", err);
      Sentry.captureException(err);
    }
  }
  scan.status.finishedAt = new Date().toISOString();
  await saveScanStatus(scan.status);
  return { status: scan.status };
}
