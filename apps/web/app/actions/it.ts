"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { checkS3Connection, resetS3Client } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import { encryptSecret } from "@/lib/secrets";
import {
  getS3Config,
  S3_SETTING_KEY,
  SENTRY_SETTING_KEY,
  type StoredS3,
  type StoredSentry,
} from "@/lib/runtimeConfig";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/** Alle IT-acties zijn superadmin-only, net als de IT-tab zelf. */
async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session.user.isSuperAdmin) throw new Error("FORBIDDEN");
  return session;
}

/**
 * Server-side Sentry-test (admin/IT). Legt bewust een fout vast via de
 * server-SDK (sentry.server.config.ts) zodat een superadmin kan verifiëren dat
 * server-events in Sentry aankomen. We vangen de fout expliciet op i.p.v. ze te
 * gooien, zodat de UI netjes het event-ID kan tonen en er geen dubbele melding
 * via `onRequestError` ontstaat.
 *
 * Geeft het Sentry-event-ID terug, of `undefined` wanneer er geen DSN is
 * geconfigureerd (dan is de SDK inert en wordt er niets verstuurd).
 */
export async function triggerSentryServerError(): Promise<string | undefined> {
  await requireSuperAdmin();

  const eventId = Sentry.captureException(
    new Error("Sentry server test error (triggered from admin/IT)"),
  );

  // In een langlopende container is dit niet strikt nodig, maar het maakt de
  // test betrouwbaar: wacht kort tot het event effectief verstuurd is.
  await Sentry.flush(2000);

  return eventId;
}

// ---- S3 / objectopslag ------------------------------------------------------

const s3Schema = z.object({
  endpoint: z.string().min(1).url(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().optional(),
  bucket: z.string().min(1),
  region: z.string().min(1),
  forcePathStyle: z.boolean(),
});

/**
 * Bewaart de S3-config in de `Setting`-tabel. De secret-key wordt versleuteld en
 * nooit teruggegeven aan de UI; blijft het veld leeg, dan houden we de bestaande
 * secret. Reset daarna de gecachte client zodat opslag meteen de nieuwe config
 * gebruikt (geen herstart nodig).
 */
export async function saveS3ConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireSuperAdmin();

  const parsed = s3Schema.safeParse({
    endpoint: ((formData.get("endpoint") as string) ?? "").trim(),
    accessKeyId: ((formData.get("accessKeyId") as string) ?? "").trim(),
    secretAccessKey: ((formData.get("secretAccessKey") as string) ?? "").trim() || undefined,
    bucket: ((formData.get("bucket") as string) ?? "").trim(),
    region: ((formData.get("region") as string) ?? "").trim() || "us-east-1",
    forcePathStyle: formData.get("forcePathStyle") === "on",
  });
  if (!parsed.success) return saveError("INVALID_INPUT");
  const p = parsed.data;

  const existingRow = await prisma.setting.findUnique({ where: { key: S3_SETTING_KEY } });
  const existing = (existingRow?.value ?? null) as unknown as StoredS3 | null;

  let secretAccessKeyEnc: string;
  if (p.secretAccessKey) {
    secretAccessKeyEnc = encryptSecret(p.secretAccessKey);
  } else if (existing?.secretAccessKeyEnc) {
    secretAccessKeyEnc = existing.secretAccessKeyEnc; // leeg gelaten: behouden
  } else {
    return saveError("S3_SECRET_REQUIRED");
  }

  const value: StoredS3 = {
    endpoint: p.endpoint,
    accessKeyId: p.accessKeyId,
    secretAccessKeyEnc,
    bucket: p.bucket,
    region: p.region,
    forcePathStyle: p.forcePathStyle,
  };

  await prisma.setting.upsert({
    where: { key: S3_SETTING_KEY },
    create: { key: S3_SETTING_KEY, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });

  resetS3Client();
  revalidatePath("/admin/it");
  return saveOk();
}

/**
 * Test de live (opgeslagen) S3-config door een HeadBucket te doen. Geeft een
 * leesbare foutmelding terug bij mislukking, zodat een superadmin credentials of
 * endpoint kan bijstellen.
 */
export async function testS3ConnectionAction(): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  try {
    await checkS3Connection(await getS3Config());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Sentry -----------------------------------------------------------------

/**
 * Bewaart de Sentry-DSN (server + client delen dezelfde) versleuteld in de
 * `Setting`-tabel. Blijft het veld leeg, dan houden we de bestaande DSN. De
 * client-DSN wordt bij de volgende paginalading opnieuw ingespoten; de
 * server-DSN geldt pas na een herstart van de container (Sentry initialiseert
 * bij het opstarten).
 */
export async function saveSentryConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireSuperAdmin();

  const dsn = ((formData.get("dsn") as string) ?? "").trim();

  const existingRow = await prisma.setting.findUnique({ where: { key: SENTRY_SETTING_KEY } });
  const existing = (existingRow?.value ?? null) as unknown as StoredSentry | null;

  let dsnEnc: string;
  if (dsn) {
    try {
      new URL(dsn);
    } catch {
      return saveError("INVALID_INPUT");
    }
    dsnEnc = encryptSecret(dsn);
  } else if (existing?.dsnEnc) {
    dsnEnc = existing.dsnEnc;
  } else {
    return saveError("SENTRY_DSN_REQUIRED");
  }

  const value: StoredSentry = { dsnEnc };
  await prisma.setting.upsert({
    where: { key: SENTRY_SETTING_KEY },
    create: { key: SENTRY_SETTING_KEY, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });

  // Root-layout verversen zodat de nieuwe client-DSN ingespoten wordt.
  revalidatePath("/", "layout");
  revalidatePath("/admin/it");
  return saveOk();
}
