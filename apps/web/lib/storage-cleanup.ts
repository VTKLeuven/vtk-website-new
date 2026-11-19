import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { deleteObject, getObjectStorageInventory } from "@vtk/storage";
import { logSystemAudit } from "@/lib/audit";
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import {
  GRACE_DAYS,
  MAX_DELETES_PER_RUN,
  planCleanup,
  type OrphanRow,
} from "@/lib/storage-cleanup-plan";
import { collectReferencedStems } from "@/lib/storage-cleanup-scan";

/**
 * De opruiming van de bucket: elke nacht de hele database doorzoeken naar de
 * keys van de algemene uploader, en een bestand dat 30 dagen aan één stuk
 * nergens meer vermeld staat, verwijderen. De regels staan in
 * `storage-cleanup-plan.ts`, het waarom in docs/design-decisions.md
 * ("Opruiming van de bucket").
 *
 * Standaard rapporteert ze enkel. Verwijderen zet een superadmin aan op
 * /admin/it/storage/cleanup, nadat het rapport een tijd klopte.
 */

/** Wat een superadmin instelt. */
export const CLEANUP_SETTING_KEY = "storage.cleanup";
/** Wat de opruiming zelf bijhoudt: de laatste ronde en de dag van de nachtelijke. */
export const CLEANUP_STATE_KEY = "storage.cleanup.state";

/** Vanaf dit uur (Brusselse klok) draait de nachtelijke ronde. */
const NIGHTLY_FROM_MINUTES = 3 * 60;
/** Zoveel S3-verwijderingen tegelijk. */
const DELETE_CONCURRENCY = 8;
/** Zoveel rijen per `createMany`/`deleteMany`, ruim onder de parameterlimiet. */
const WRITE_CHUNK = 1000;

export type CleanupSettings = { deleteEnabled: boolean };

export type CleanupTrigger = "nightly" | "manual";

export type CleanupRunSummary =
  | {
      status: "ok";
      trigger: CleanupTrigger;
      finishedAt: string;
      durationMs: number;
      deleteEnabled: boolean;
      tables: number;
      bucketObjects: number;
      checked: number;
      referenced: number;
      tooRecent: number;
      unrecognised: number;
      newOrphans: number;
      released: number;
      orphans: number;
      orphanBytes: number;
      due: number;
      deleted: number;
      deletedBytes: number;
      deleteFailed: number;
    }
  | {
      status: "skipped";
      trigger: CleanupTrigger;
      finishedAt: string;
      reason: "not-configured";
    }
  | {
      status: "failed";
      trigger: CleanupTrigger;
      finishedAt: string;
      durationMs: number;
      error: string;
    };

type OkSummary = Extract<CleanupRunSummary, { status: "ok" }>;

/**
 * `lastOk` apart van `lastRun`: na een ronde die faalt, blijven de cijfers van
 * de laatste geslaagde staan, in plaats van een scherm vol streepjes.
 */
type CleanupState = { lastRun?: CleanupRunSummary; lastOk?: OkSummary; nightlyDay?: string };

/**
 * Een leesbare foutmelding. De S3-client gooit bij een geweigerde verbinding
 * een fout zonder `message` (een `AggregateError`), en dan stond er niets.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return describeError(error.errors[0]);
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return error.message || (typeof code === "string" ? code : "") || error.name;
  }
  return String(error);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getCleanupSettings(): Promise<CleanupSettings> {
  const row = await prisma.setting.findUnique({ where: { key: CLEANUP_SETTING_KEY } });
  return { deleteEnabled: asObject(row?.value).deleteEnabled === true };
}

export async function setCleanupDeleteEnabled(deleteEnabled: boolean): Promise<void> {
  const value = { deleteEnabled } satisfies CleanupSettings;
  await prisma.setting.upsert({
    where: { key: CLEANUP_SETTING_KEY },
    create: { key: CLEANUP_SETTING_KEY, value },
    update: { value },
  });
}

async function readState(): Promise<CleanupState> {
  const row = await prisma.setting.findUnique({ where: { key: CLEANUP_STATE_KEY } });
  const value = asObject(row?.value);
  return {
    lastRun: value.lastRun as CleanupRunSummary | undefined,
    lastOk: value.lastOk as OkSummary | undefined,
    nightlyDay: typeof value.nightlyDay === "string" ? value.nightlyDay : undefined,
  };
}

/**
 * Schrijft één veld van de toestand bij. Draagt nooit een key: de scan leest
 * ook de `Setting`-tabel, en een key hier zou als verwijzing gelden.
 */
async function updateState(patch: Partial<CleanupState>): Promise<void> {
  const value = { ...(await readState()), ...patch } as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: CLEANUP_STATE_KEY },
    create: { key: CLEANUP_STATE_KEY, value },
    update: { value },
  });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function deleteObjects(rows: readonly OrphanRow[]): Promise<{ deleted: OrphanRow[]; failed: number }> {
  const deleted: OrphanRow[] = [];
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++]!;
      try {
        await deleteObject(row.key);
        deleted.push(row);
      } catch (error) {
        failed += 1;
        console.error("[storage-cleanup] kon object niet verwijderen", row.key, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, rows.length) }, worker));
  return { deleted, failed };
}

const MEGABYTES = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });

/**
 * Eén ronde: de bucket oplijsten, de database doorzoeken, de wezen bijwerken
 * en, als dat aan staat en `allowDelete` het toelaat, wie zijn wachttijd uit
 * heeft verwijderen. Idempotent: twee rondes na elkaar doen samen wat één doet.
 *
 * De knop "Scan now" geeft `allowDelete: false`: een scan die je met de hand
 * start om te kijken, hoort niets weg te gooien.
 */
export async function runStorageCleanup({
  now = new Date(),
  trigger,
  allowDelete,
}: {
  now?: Date;
  trigger: CleanupTrigger;
  allowDelete: boolean;
}): Promise<CleanupRunSummary> {
  const started = Date.now();
  // In welke stap een fout viel, voor de melding op het scherm.
  let step = "Listing the bucket";
  try {
    let inventory: Awaited<ReturnType<typeof getObjectStorageInventory>>;
    try {
      inventory = await getObjectStorageInventory();
    } catch (error) {
      if (error instanceof Error && /not configured/i.test(error.message)) {
        const summary: CleanupRunSummary = {
          status: "skipped",
          trigger,
          finishedAt: new Date().toISOString(),
          reason: "not-configured",
        };
        await updateState({ lastRun: summary });
        return summary;
      }
      throw error;
    }

    step = "Searching the database";
    const [{ stems, tables }, settings, existing] = await Promise.all([
      collectReferencedStems(),
      getCleanupSettings(),
      prisma.storageOrphan.findMany({ select: { key: true, sizeBytes: true, firstSeenAt: true } }),
    ]);

    const plan = planCleanup({ objects: inventory.objects, referencedStems: stems, existing, now });

    // Een scan die niets vindt terwijl er bestanden zijn, is stuk en niet
    // leeg: elke pagina met een foto verwijst naar iets. Niets aanraken.
    if (plan.checked > 0 && stems.size === 0) {
      throw new Error("it found no references at all, which means the scan is broken, not that every file is unused");
    }

    step = "Updating the list of unreferenced files";

    for (const part of chunks(plan.released, WRITE_CHUNK)) {
      await prisma.storageOrphan.deleteMany({ where: { key: { in: part } } });
    }
    for (const part of chunks(plan.newOrphans, WRITE_CHUNK)) {
      await prisma.storageOrphan.createMany({
        data: part.map((row) => ({ key: row.key, sizeBytes: row.sizeBytes, firstSeenAt: now })),
        skipDuplicates: true,
      });
    }

    step = "Deleting due files";
    const deleteEnabled = settings.deleteEnabled;
    const toDelete = deleteEnabled && allowDelete ? plan.due.slice(0, MAX_DELETES_PER_RUN) : [];
    const { deleted, failed } = await deleteObjects(toDelete);
    for (const part of chunks(deleted.map((row) => row.key), WRITE_CHUNK)) {
      await prisma.storageOrphan.deleteMany({ where: { key: { in: part } } });
    }
    const deletedBytes = deleted.reduce((total, row) => total + row.sizeBytes, 0);
    if (deleted.length > 0) {
      await logSystemAudit(
        {
          action: "delete",
          entity: "storageCleanup",
          target: "Bestanden zonder verwijzing",
          summary: `${deleted.length} ${deleted.length === 1 ? "bestand" : "bestanden"} verwijderd (${MEGABYTES.format(deletedBytes / 1024 / 1024)} MB) na ${GRACE_DAYS} dagen zonder verwijzing`,
        },
        "Opruiming van de bucket",
      );
    }

    const deletedKeys = new Set(deleted.map((row) => row.key));
    const remaining = plan.orphans.filter((row) => !deletedKeys.has(row.key));
    const summary: CleanupRunSummary = {
      status: "ok",
      trigger,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      deleteEnabled,
      tables,
      bucketObjects: inventory.objects.length,
      checked: plan.checked,
      referenced: plan.referenced,
      tooRecent: plan.tooRecent,
      unrecognised: plan.unrecognised,
      newOrphans: plan.newOrphans.length,
      released: plan.released.length,
      orphans: remaining.length,
      orphanBytes: remaining.reduce((total, row) => total + row.sizeBytes, 0),
      due: plan.due.length - deleted.length,
      deleted: deleted.length,
      deletedBytes,
      deleteFailed: failed,
    };
    await updateState({ lastRun: summary, lastOk: summary });
    return summary;
  } catch (error) {
    const summary: CleanupRunSummary = {
      status: "failed",
      trigger,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: `${step} failed: ${describeError(error)}`.slice(0, 300),
    };
    await updateState({ lastRun: summary }).catch(() => undefined);
    throw error;
  }
}

/**
 * Voor de background-worker, die elke vijf minuten langskomt: één ronde per
 * Brusselse dag, vanaf 3u. De dag wordt geclaimd voor de ronde begint, zodat
 * een ronde die faalt niet elke vijf minuten opnieuw de hele database
 * doorzoekt; de volgende nacht probeert ze opnieuw.
 */
export async function runNightlyStorageCleanup(
  now: Date = new Date(),
): Promise<CleanupRunSummary | { skipped: "before-03:00" | "done-today" }> {
  if (brusselsMinutesOfDay(now) < NIGHTLY_FROM_MINUTES) return { skipped: "before-03:00" };
  const today = ymdKey(brusselsYMD(now));
  const state = await readState();
  if (state.nightlyDay === today) return { skipped: "done-today" };
  await updateState({ nightlyDay: today });
  return runStorageCleanup({ now, trigger: "nightly", allowDelete: true });
}

export type CleanupReport = {
  settings: CleanupSettings;
  lastRun: CleanupRunSummary | null;
  /** De laatste ronde die slaagde; dezelfde als `lastRun` tenzij die faalde. */
  lastOk: OkSummary | null;
  orphanCount: number;
  orphanBytes: number;
  /** Wezen waarvan de wachttijd om is: wat de volgende nacht weggaat, als het aan staat. */
  dueCount: number;
  rows: OrphanRow[];
};

/** Voor /admin/it/storage: wat de laatste ronde vond, de oudste wezen eerst. */
export async function getCleanupReport({
  limit,
  now = new Date(),
}: {
  limit: number;
  now?: Date;
}): Promise<CleanupReport> {
  const dueBefore = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const [settings, state, aggregate, dueCount, rows] = await Promise.all([
    getCleanupSettings(),
    readState(),
    prisma.storageOrphan.aggregate({ _count: { _all: true }, _sum: { sizeBytes: true } }),
    prisma.storageOrphan.count({ where: { firstSeenAt: { lte: dueBefore } } }),
    limit > 0
      ? prisma.storageOrphan.findMany({
          orderBy: [{ firstSeenAt: "asc" }, { key: "asc" }],
          take: limit,
          select: { key: true, sizeBytes: true, firstSeenAt: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    settings,
    lastRun: state.lastRun ?? null,
    lastOk: state.lastOk ?? null,
    orphanCount: aggregate._count._all,
    orphanBytes: aggregate._sum.sizeBytes ?? 0,
    dueCount,
    rows,
  };
}
