import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";

export type S3Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
};

/**
 * De S3-configuratie kan tijdens runtime veranderen (ze wordt beheerd via
 * Admin -> IT en in de database bewaard). Daarom bouwen we de `S3Client` niet
 * meer één keer bij het laden van de module, maar via een resolver die de app
 * registreert. De resolver + de gebouwde client leven op `globalThis` zodat er
 * één instantie gedeeld wordt over Next's aparte route/instrumentation-bundels
 * binnen hetzelfde proces (een module-lokale `let` zou per bundel verschillen).
 */
type StorageGlobal = {
  resolver?: () => Promise<S3Config>;
  cache?: { client: S3Client; bucket: string };
};

const g = globalThis as typeof globalThis & { __vtkStorage?: StorageGlobal };

function store(): StorageGlobal {
  return (g.__vtkStorage ??= {});
}

/** Config uit de omgeving; fallback zolang er geen resolver of DB-config is. */
function envConfig(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || "",
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "fsn1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

/**
 * Registreer een async resolver voor de live S3-config (bv. uit de database).
 * Roep dit één keer op bij het opstarten. Wist de client-cache.
 */
export function setS3ConfigResolver(fn: () => Promise<S3Config>): void {
  const s = store();
  s.resolver = fn;
  s.cache = undefined;
}

/** Gooi de gecachte client weg, zodat de volgende oproep verse config gebruikt. */
export function resetS3Client(): void {
  store().cache = undefined;
}

async function resolveConfig(): Promise<S3Config> {
  const s = store();
  if (s.resolver) {
    try {
      return await s.resolver();
    } catch {
      // Faalt de DB-lezing, val dan terug op env zodat storage blijft werken.
      return envConfig();
    }
  }
  return envConfig();
}

async function getClient(): Promise<{ client: S3Client; bucket: string }> {
  const s = store();
  if (s.cache) return s.cache;
  const cfg = await resolveConfig();
  if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error("S3 object storage is not configured; configure Hetzner in Admin -> IT");
  }
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: cfg.forcePathStyle,
  });
  s.cache = { client, bucket: cfg.bucket };
  return s.cache;
}

export function newStorageKey(prefix: string, originalName?: string | null): string {
  const id = randomBytes(12).toString("hex");
  const ext = originalName ? extname(originalName).toLowerCase() : "";
  return `${prefix}/${id}${ext}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const { client, bucket } = await getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = await getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Streamt een object, optioneel een byte-range (de ruwe `Range`-header).
 *
 * De range gaat ongewijzigd naar S3 en het antwoord draagt `contentRange`, zodat
 * de route een echte 206 kan teruggeven. Zonder dat moet een PDF-lezer het hele
 * bestand binnenhalen voor hij bladzijde 1 kan tonen.
 */
export async function getObjectStream(
  key: string,
  range?: string | null
): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string | undefined;
  contentLength: number | undefined;
  contentRange: string | undefined;
  etag: string | undefined;
  lastModified: Date | undefined;
}> {
  const { client, bucket } = await getClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: range ?? undefined })
  );
  const body = res.Body;
  if (!body) throw new Error(`Object not found: ${key}`);
  const stream = body as unknown as NodeJS.ReadableStream;
  return {
    stream,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    etag: res.ETag,
    lastModified: res.LastModified,
  };
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { stream } = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array)
    );
  }
  return Buffer.concat(chunks);
}

/**
 * Test of de opgegeven config effectief een bereikbare, toegankelijke bucket
 * oplevert. Gebruikt door de "Test connection"-knop op Admin -> IT. Bouwt een
 * losse client (raakt de cache niet) zodat je nog niet-opgeslagen config kunt
 * toetsen.
 */
export async function checkS3Connection(cfg: S3Config): Promise<void> {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: cfg.forcePathStyle,
  });
  await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
}

export type ZipEntry = { key: string; name: string };

// Stream a ZIP archive built from a list of S3 objects. Returns a web-stream
// suitable for a Next.js Route Handler Response.
export function streamAlbumZip(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const archive = archiver("zip", { zlib: { level: 6 } });

  (async () => {
    try {
      for (const entry of entries) {
        const { stream } = await getObjectStream(entry.key);
        archive.append(stream as Readable, { name: entry.name });
      }
      await archive.finalize();
    } catch (err) {
      archive.abort();
      archive.emit("error", err);
    }
  })();

  return Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
}
