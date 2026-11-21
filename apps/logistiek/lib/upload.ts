import 'server-only';

import sharp from 'sharp';
import { THUMB_WIDTH } from './photo-url';

/**
 * Wat er van een upload in de bucket komt (S3 uit de audit van november 2026).
 *
 * Voordien las de route het hele bestand in zonder bovengrens, geloofde ze het
 * MIME-type dat de browser opgaf, en bewaarde ze de ruwe bytes onder dat type
 * wanneer sharp de "foto" niet kon lezen. Een HTML-bestand dat zich als
 * `image/png` aanbood, stond zo in de bucket en werd inline geserveerd.
 *
 * Nu beslissen de bytes zelf:
 * - begint het met `%PDF-`, dan is het een pdf en blijft het zoals het is;
 * - anders moet sharp het kunnen lezen, en dan wordt het opnieuw een JPEG
 *   (dat haalt ook EXIF en een ingebedde payload weg);
 * - lukt geen van beide, dan wordt het geweigerd, met een code die de client
 *   op een zin mapt.
 */

/** Boven deze grootte weigert de route, nog voor ze het bestand inleest. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Ruimte voor de multipart-omhulling rond het bestand zelf. */
const MULTIPART_SLACK = 64 * 1024;

export type UploadError = 'too_large' | 'no_file' | 'unsupported_file';

export type PreparedUpload =
  | {
      ok: true;
      body: Buffer;
      contentType: 'image/jpeg' | 'application/pdf';
      name: string;
      /** Enkel bij een foto: de thumbnail van 400 px voor de catalogus (P2). */
      thumb?: Buffer;
    }
  | { ok: false; error: UploadError };

/** Wat de `Content-Length` van het verzoek mag zijn, voor `formData()` alles inleest. */
export function requestTooLarge(contentLength: string | null): boolean {
  const declared = Number(contentLength ?? 0);
  return Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + MULTIPART_SLACK;
}

export function isPdf(bytes: Uint8Array): boolean {
  // "%PDF-" in ASCII. Een lezer zoekt de kop ook iets verder, maar elk bestand
  // dat een gewone pdf-maker schrijft, begint ermee.
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/** Een pdf blijft zoals hij is; al de rest moet een foto zijn die sharp kan lezen. */
export async function prepareUpload(bytes: Buffer, originalName: string): Promise<PreparedUpload> {
  if (bytes.length === 0) return { ok: false, error: 'no_file' };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' };

  if (isPdf(bytes)) {
    const base = originalName.trim().replace(/\.pdf$/i, '') || 'bestand';
    return { ok: true, body: bytes, contentType: 'application/pdf', name: `${base}.pdf` };
  }

  try {
    const body = await sharp(bytes)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    return { ok: true, body, contentType: 'image/jpeg', name: 'foto.jpg', thumb: await makeThumb(body) };
  } catch {
    return { ok: false, error: 'unsupported_file' };
  }
}

/** Een thumbnail van een foto die al een JPEG is (bij het opladen, of achteraf). */
export async function makeThumb(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg)
    .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}
