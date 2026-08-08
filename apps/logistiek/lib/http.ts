export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('REQUEST_BODY_TOO_LARGE');
    this.name = 'RequestBodyTooLargeError';
  }
}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytesRead = 0;
  let body = '';
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
    return body;
  } finally {
    reader.releaseLock();
  }
}
