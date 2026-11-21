import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { mediaResponseInit } from '@vtk/storage';
import { MAX_UPLOAD_BYTES, isPdf, prepareUpload, requestTooLarge } from '@/lib/upload';

/**
 * De upload van de uitleendienst (S3 uit de audit van november 2026): de bytes
 * beslissen, niet het type dat de browser opgaf. Met echte sharp en echte
 * bytes, want precies het geval "sharp kan dit niet lezen" bewaarde voordien de
 * ruwe bytes onder een verzonnen type.
 */

async function png(width = 40, height = 20): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 210, b: 63 } } })
    .png()
    .toBuffer();
}

describe('prepareUpload', () => {
  it('maakt van een foto een JPEG, wat de browser er ook over zei', async () => {
    const result = await prepareUpload(await png(), 'logo.png');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contentType).toBe('image/jpeg');
    expect(result.name).toBe('foto.jpg');
    expect((await sharp(result.body).metadata()).format).toBe('jpeg');
  });

  it('verkleint een grote foto tot 1200 px', async () => {
    const result = await prepareUpload(await png(3000, 1500), 'groot.png');
    expect(result.ok && (await sharp(result.body).metadata()).width).toBe(1200);
  });

  it('laat een pdf zoals hij is, herkend aan zijn kop', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const result = await prepareUpload(pdf, 'Handleiding geluid.PDF');
    expect(result).toMatchObject({ ok: true, contentType: 'application/pdf', name: 'Handleiding geluid.pdf' });
    expect(result.ok && result.body.equals(pdf)).toBe(true);
  });

  it('weigert wat geen foto en geen pdf is, ook als het zich als foto voordoet', async () => {
    const html = Buffer.from('<!doctype html><script>alert(1)</script>');
    expect(await prepareUpload(html, 'foto.png')).toEqual({ ok: false, error: 'unsupported_file' });
    // Een "pdf" zonder de kop is ook geen pdf.
    expect(await prepareUpload(Buffer.from('niet echt een pdf'), 'x.pdf')).toEqual({
      ok: false,
      error: 'unsupported_file',
    });
  });

  it('weigert een leeg of te groot bestand', async () => {
    expect(await prepareUpload(Buffer.alloc(0), 'leeg.jpg')).toEqual({ ok: false, error: 'no_file' });
    expect(await prepareUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'groot.pdf')).toEqual({
      ok: false,
      error: 'too_large',
    });
  });

  it('kijkt naar de Content-Length voor er iets ingelezen wordt', () => {
    expect(requestTooLarge(String(5 * 1024 * 1024))).toBe(false);
    expect(requestTooLarge(String(MAX_UPLOAD_BYTES + 1024 * 1024))).toBe(true);
    expect(requestTooLarge(null)).toBe(false);
    expect(isPdf(Buffer.from('%PDF-'))).toBe(true);
    expect(isPdf(Buffer.from('%PDF'))).toBe(false);
  });
});

describe('mediaResponseInit (gedeeld met vtk.be)', () => {
  const object = (contentType: string) => ({
    contentType,
    contentLength: 10,
    contentRange: undefined,
    etag: '"e"',
    lastModified: new Date('2026-11-01T00:00:00Z'),
  });

  it('zet een SVG of HTML in een sandbox en laat ze downloaden', () => {
    const init = mediaResponseInit(new Request('https://logistiek.vtk.be/api/media/uitleen/x.svg'), 'uitleen/x.svg', object('image/svg+xml'));
    const headers = new Headers(init.headers);
    expect(headers.get('content-security-policy')).toContain('sandbox');
    expect(headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('serveert een foto gewoon inline, hard gecachet, met ETag', () => {
    const init = mediaResponseInit(new Request('https://logistiek.vtk.be/api/media/uitleen/x.jpg'), 'uitleen/x.jpg', object('image/jpeg'));
    const headers = new Headers(init.headers);
    expect(init.status).toBe(200);
    expect(headers.get('content-disposition')).toBeNull();
    expect(headers.get('etag')).toBe('"e"');
    expect(headers.get('cache-control')).toContain('immutable');
  });

  it('geeft een 206 met Content-Range voor een stuk van een pdf', () => {
    const init = mediaResponseInit(new Request('https://logistiek.vtk.be/api/media/uitleen/x.pdf'), 'uitleen/x.pdf', {
      ...object('application/pdf'),
      contentRange: 'bytes 0-9/100',
    });
    expect(init.status).toBe(206);
    expect(new Headers(init.headers).get('content-range')).toBe('bytes 0-9/100');
  });
});

describe('thumbnails van de catalogus (P2)', () => {
  it('leidt de thumbnail af van de foto, en terug', async () => {
    const { originalOfThumb, thumbKey, thumbUrl } = await import('@/lib/photo-url');
    expect(thumbKey('uitleen/abc123.jpg')).toBe('uitleen/abc123.thumb.jpg');
    expect(originalOfThumb('uitleen/abc123.thumb.jpg')).toBe('uitleen/abc123.jpg');
    // Een pdf, een thumbnail zelf of iets buiten de uitleendienst heeft er geen.
    expect(thumbKey('uitleen/handleiding.pdf')).toBeNull();
    expect(thumbKey('uitleen/abc123.thumb.jpg')).toBeNull();
    expect(thumbKey('images/abc123.jpg')).toBeNull();
    expect(originalOfThumb('uitleen/abc123.jpg')).toBeNull();
    expect(thumbUrl('uitleen/handleiding.pdf')).toBe('/api/media/uitleen/handleiding.pdf');
  });

  it('maakt bij het opladen een thumbnail van 400 px naast de foto', async () => {
    const result = await prepareUpload(await png(2400, 1600), 'groot.png');
    expect(result.ok).toBe(true);
    if (!result.ok || !result.thumb) throw new Error('geen thumbnail');
    const meta = await sharp(result.thumb).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(400);
    expect(result.thumb.length).toBeLessThan(result.body.length);
  });

  it('geeft een pdf geen thumbnail', async () => {
    const result = await prepareUpload(Buffer.from('%PDF-1.7\n%%EOF'), 'x.pdf');
    expect(result.ok && result.thumb).toBeFalsy();
  });
});
