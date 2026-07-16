export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("REQUEST_BODY_TOO_LARGE");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new SyntaxError("Missing JSON body");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return body;
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new Error("UNSUPPORTED_MEDIA_TYPE");
  return JSON.parse(await readLimitedText(request, maxBytes)) as unknown;
}

export function trustedClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}
