import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De mediaroute maakt een ontbrekende thumbnail zelf aan (P2): een foto van
 * vóór de thumbnails krijgt er een bij de eerste vraag, en die wordt bewaard.
 */
const storage = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
  getObjectBuffer: vi.fn(),
  putObject: vi.fn(),
}));

vi.mock('@vtk/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vtk/storage')>()),
  getObjectStream: storage.getObjectStream,
  getObjectBuffer: storage.getObjectBuffer,
  putObject: storage.putObject,
}));

const { GET } = await import('@/app/api/media/[...key]/route');

function call(key: string) {
  return GET(new Request(`https://logistiek.vtk.be/api/media/${key}`), {
    params: Promise.resolve({ key: key.split('/') }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.getObjectStream.mockRejectedValue(new Error('NoSuchKey'));
  storage.putObject.mockResolvedValue(undefined);
});

describe('GET /api/media (uitleendienst)', () => {
  it('maakt een ontbrekende thumbnail uit de foto en bewaart ze', async () => {
    const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ffd23f' } })
      .jpeg()
      .toBuffer();
    storage.getObjectBuffer.mockResolvedValue(photo);

    const response = await call('uitleen/abc123.thumb.jpg');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(storage.getObjectBuffer).toHaveBeenCalledWith('uitleen/abc123.jpg');
    expect(storage.putObject).toHaveBeenCalledWith('uitleen/abc123.thumb.jpg', expect.any(Buffer), 'image/jpeg');
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.width).toBe(400);
  });

  it('geeft 404 voor een gewone key die er niet is, zonder iets te maken', async () => {
    const response = await call('uitleen/bestaat-niet.jpg');
    expect(response.status).toBe(404);
    expect(storage.getObjectBuffer).not.toHaveBeenCalled();
  });

  it('geeft 404 wanneer ook de foto zelf weg is', async () => {
    storage.getObjectBuffer.mockRejectedValue(new Error('NoSuchKey'));
    const response = await call('uitleen/weg.thumb.jpg');
    expect(response.status).toBe(404);
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
