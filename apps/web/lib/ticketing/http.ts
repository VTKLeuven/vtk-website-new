export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("REQUEST_BODY_TOO_LARGE");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new SyntaxError("Missing request body");

  const reader = request.body.getReader();
  let bytesRead = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await readLimitedBytes(request, maxBytes),
  );
}

export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  const normalizedContentType = contentType.toLowerCase();
  if (
    !normalizedContentType.startsWith("multipart/form-data") &&
    !normalizedContentType.startsWith("application/x-www-form-urlencoded")
  ) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }
  const bytes = await readLimitedBytes(request, maxBytes);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, { headers: { "content-type": contentType } }).formData();
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new Error("UNSUPPORTED_MEDIA_TYPE");
  return JSON.parse(await readLimitedText(request, maxBytes)) as unknown;
}

export function trustedClientIp(request: Request): string {
  // X-Real-IP is not set or scrubbed by the documented Caddy deployment, so a
  // browser can supply it itself. Caddy owns X-Forwarded-For and puts the
  // directly connected client at the final hop; only that hop is trusted.
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}
