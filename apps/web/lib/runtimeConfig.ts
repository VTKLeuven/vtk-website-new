import "server-only";
import { prisma } from "@vtk/db";
import type { S3Config } from "@vtk/storage";
import { decryptSecret } from "./secrets";

/**
 * Leest de runtime-configuratie (S3-objectopslag en Sentry-DSN) die via
 * Admin -> IT beheerd wordt en in de `Setting`-tabel staat. Gevoelige waarden
 * (S3-secret-key, Sentry-DSN) worden versleuteld bewaard; hier ontsleutelen we
 * ze server-side. Zonder DB-config vallen we terug op de omgeving, zodat
 * bestaande deploys blijven werken tot een superadmin het invult.
 */

export const S3_SETTING_KEY = "s3.config";
export const SENTRY_SETTING_KEY = "sentry.config";

/** Vorm zoals in de DB bewaard: de secret staat versleuteld in `secretAccessKeyEnc`. */
export type StoredS3 = {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKeyEnc?: string;
  bucket?: string;
  region?: string;
  forcePathStyle?: boolean;
};

export type StoredSentry = {
  dsnEnc?: string;
};

function envS3(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || "",
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "fsn1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

function isComplete(v: StoredS3 | null | undefined): v is Required<Pick<
  StoredS3,
  "endpoint" | "accessKeyId" | "secretAccessKeyEnc" | "bucket"
>> &
  StoredS3 {
  return Boolean(v && v.endpoint && v.accessKeyId && v.secretAccessKeyEnc && v.bucket);
}

/** Live S3-config voor de storage-resolver. DB wint; anders de omgeving. */
export async function getS3Config(): Promise<S3Config> {
  const env = envS3();
  try {
    const row = await prisma.setting.findUnique({ where: { key: S3_SETTING_KEY } });
    const v = (row?.value ?? null) as unknown as StoredS3 | null;
    if (isComplete(v)) {
      return {
        endpoint: v.endpoint,
        accessKeyId: v.accessKeyId,
        secretAccessKey: decryptSecret(v.secretAccessKeyEnc),
        bucket: v.bucket,
        region: v.region || env.region,
        forcePathStyle: v.forcePathStyle ?? env.forcePathStyle,
      };
    }
  } catch {
    /* val terug op env */
  }
  return env;
}

export type S3Status = {
  source: "database" | "environment";
  endpoint: string | null;
  accessKeyId: string | null;
  bucket: string | null;
  region: string | null;
  forcePathStyle: boolean;
  /** Of er een secret bekend is; de waarde zelf geven we nooit terug. */
  hasSecret: boolean;
};

/** Niet-gevoelige status voor de UI. Toont nooit de secret-key. */
export async function getS3Status(): Promise<S3Status> {
  const row = await prisma.setting.findUnique({ where: { key: S3_SETTING_KEY } });
  const v = (row?.value ?? null) as unknown as StoredS3 | null;
  if (isComplete(v)) {
    return {
      source: "database",
      endpoint: v.endpoint,
      accessKeyId: v.accessKeyId,
      bucket: v.bucket,
      region: v.region ?? null,
      forcePathStyle: v.forcePathStyle ?? true,
      hasSecret: Boolean(v.secretAccessKeyEnc),
    };
  }
  return {
    source: "environment",
    endpoint: process.env.S3_ENDPOINT ?? null,
    accessKeyId: process.env.S3_ACCESS_KEY ?? null,
    bucket: process.env.S3_BUCKET ?? null,
    region: process.env.S3_REGION ?? null,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    hasSecret: Boolean(process.env.S3_SECRET_KEY),
  };
}

/** De Sentry-DSN (server + client delen dezelfde). DB wint; anders de omgeving. */
export async function getSentryDsn(): Promise<string | undefined> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SENTRY_SETTING_KEY } });
    const v = (row?.value ?? null) as unknown as StoredSentry | null;
    if (v?.dsnEnc) return decryptSecret(v.dsnEnc);
  } catch {
    /* val terug op env */
  }
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

export type SentryStatus = {
  source: "database" | "environment" | "none";
  hasDsn: boolean;
};

export async function getSentryStatus(): Promise<SentryStatus> {
  const row = await prisma.setting.findUnique({ where: { key: SENTRY_SETTING_KEY } });
  const v = (row?.value ?? null) as unknown as StoredSentry | null;
  if (v?.dsnEnc) return { source: "database", hasDsn: true };
  const envDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  return { source: envDsn ? "environment" : "none", hasDsn: Boolean(envDsn) };
}
