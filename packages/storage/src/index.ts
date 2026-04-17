import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";

const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const accessKeyId = process.env.S3_ACCESS_KEY || "minioadmin";
const secretAccessKey = process.env.S3_SECRET_KEY || "minioadmin";
const bucket = process.env.S3_BUCKET || "vtk";
const region = process.env.S3_REGION || "us-east-1";

export const s3Bucket = bucket;

export const s3 = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

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
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObjectStream(key: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string | undefined;
  contentLength: number | undefined;
}> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body;
  if (!body) throw new Error(`Object not found: ${key}`);
  const stream = body as unknown as NodeJS.ReadableStream;
  return {
    stream,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
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
