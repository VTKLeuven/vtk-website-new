/**
 * Een request lezen zonder de server te laten vollopen.
 *
 * Overgenomen uit `apps/web/lib/ticketing/http.ts`. Die versie zit verweven met
 * het ticketgedeelte van de hoofdsite; hier staan enkel de drie stukken die de
 * uploadroute nodig heeft.
 */

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('REQUEST_BODY_TOO_LARGE');
    this.name = 'RequestBodyTooLargeError';
  }
}

/**
 * Leest hoogstens `maxBytes` en breekt af zodra dat overschreden wordt.
 * `content-length` is enkel een eerste zeef: die mag liegen, dus we tellen ook
 * tijdens het lezen.
 */
async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new SyntaxError('Missing request body');

  const reader = request.body.getReader();
  let bytesRead = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
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

export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? '';
  const normalized = contentType.toLowerCase();
  if (!normalized.startsWith('multipart/form-data') && !normalized.startsWith('application/x-www-form-urlencoded')) {
    throw new Error('UNSUPPORTED_MEDIA_TYPE');
  }
  const bytes = await readLimitedBytes(request, maxBytes);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, { headers: { 'content-type': contentType } }).formData();
}

/**
 * Het IP dat we mogen geloven. Caddy bezit `X-Forwarded-For` en zet de
 * rechtstreeks verbonden client op de laatste plaats; enkel die hop is
 * betrouwbaar. `X-Real-IP` niet gebruiken: die valt door een browser zelf mee
 * te sturen.
 */
export function trustedClientIp(request: Request): string {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || 'unknown';
}
