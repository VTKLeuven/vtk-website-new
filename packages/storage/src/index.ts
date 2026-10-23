import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
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
  s.cache = { client: buildClient(cfg), bucket: cfg.bucket };
  return s.cache;
}

/**
 * De SDK heeft standaard geen enkele timeout en 50 sockets per client. Hangt
 * de opslag, dan blijft elk verzoek dat al een socket had er voor altijd op
 * wachten, en na vijftig zo'n verzoeken staat elke afbeelding van de site in de
 * rij. `requestTimeout` loopt tot de headers van het antwoord binnen zijn (voor
 * een upload dus over de hele body), niet over het lezen van een download: een
 * trage lezer van een groot bestand breekt hier niet op af.
 */
function buildClient(cfg: S3Config): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: cfg.forcePathStyle,
    requestHandler: {
      connectionTimeout: 5_000,
      requestTimeout: 60_000,
      throwOnRequestTimeout: true,
    },
  });
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

/**
 * Geeft een geopend object terug als `Response`, en laat zijn S3-verbinding
 * nooit liggen.
 *
 * Een GetObject houdt zijn socket bezet tot de body gelezen of afgebroken is.
 * Een body die niemand leest of sluit, houdt die socket dus voor altijd, en na
 * vijftig zulke verzoeken laadt geen enkele afbeelding van de site nog. Dat
 * gebeurde op twee manieren:
 *
 * - Next beantwoordt een HEAD door de GET-handler aan te roepen en de body
 *   daarna weg te gooien, zonder hem af te breken.
 * - Een header die gooit terwijl het object al open is: een bestandsnaam met
 *   een gedachtestreepje of een emoji in `content-disposition`. De route gaf in
 *   haar catch een 404 en de stream bleef open.
 *
 * `init` bouwt status en headers. Gooit die, dan sluit deze functie eerst de
 * stream en gooit ze daarna door, zodat de catch van de route gewoon werkt.
 */
export function objectResponse(
  request: Request,
  stream: NodeJS.ReadableStream,
  init: () => ResponseInit
): Response {
  const source = stream as Readable;
  try {
    const responseInit = init();
    if (request.method === "HEAD") {
      source.destroy();
      return new Response(null, responseInit);
    }
    return new Response(Readable.toWeb(source) as unknown as BodyInit, responseInit);
  } catch (error) {
    source.destroy();
    throw error;
  }
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
  const client = buildClient(cfg);
  await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
}

export type StoredObjectMetadata = {
  key: string;
  sizeBytes: number;
  lastModified: Date | null;
};

export type ObjectStorageInventory = {
  bucket: string;
  objects: StoredObjectMetadata[];
  totalBytes: number;
};

/**
 * Inventariseer de volledige bucket zonder objectinhoud op te halen.
 *
 * De keys blijven server-side: het storage-dashboard aggregeert ze onmiddellijk
 * per feature en toont nooit individuele bestandsnamen. `ListObjectsV2` levert
 * maximaal 1.000 objecten per antwoord, dus de continuation token moet gevolgd
 * worden om grote buckets niet stil te onderschatten.
 */
export async function getObjectStorageInventory(): Promise<ObjectStorageInventory> {
  const { client, bucket } = await getClient();
  const objects: StoredObjectMetadata[] = [];
  const seenTokens = new Set<string>();
  let continuationToken: string | undefined;

  do {
    if (continuationToken) {
      if (seenTokens.has(continuationToken)) {
        throw new Error("S3 object listing returned a repeated continuation token");
      }
      seenTokens.add(continuationToken);
    }

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) continue;
      objects.push({
        key: object.Key,
        sizeBytes: Math.max(0, Number(object.Size) || 0),
        lastModified: object.LastModified ?? null,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    if (response.IsTruncated && !continuationToken) {
      throw new Error("S3 object listing was truncated without a continuation token");
    }
  } while (continuationToken);

  return {
    bucket,
    objects,
    totalBytes: objects.reduce((total, object) => total + object.sizeBytes, 0),
  };
}

export type ZipEntry = { key: string; name: string };

// Stream a ZIP archive built from a list of S3 objects. Returns a web-stream
// suitable for a Next.js Route Handler Response.
//
// Elk object gaat pas open wanneer het vorige in het archief zit. Alles meteen
// openen hield de hele pool van vijftig S3-sockets bezet zolang de download
// liep, en zolang laadde geen enkele afbeelding van de site. Stopt de lezer,
// dan gaat het object dat openstaat ook dicht.
export function streamAlbumZip(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const archive = archiver("zip", { zlib: { level: 6 } });
  let current: Readable | undefined;
  let closed = false;
  const closing = new Promise<void>((resolve) => {
    archive.once("close", () => {
      closed = true;
      current?.destroy();
      resolve();
    });
  });

  (async () => {
    try {
      for (const entry of entries) {
        if (closed) return;
        const { stream } = await getObjectStream(entry.key);
        current = stream as Readable;
        if (closed) {
          current.destroy();
          return;
        }
        const written = once(archive, "entry");
        archive.append(current, { name: entry.name });
        await Promise.race([written, closing]);
      }
      if (!closed) await archive.finalize();
    } catch (err) {
      current?.destroy();
      archive.abort();
      archive.emit("error", err);
    }
  })();

  return Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
}
