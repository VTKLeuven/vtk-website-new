import type { ImmichAsset } from './types';

export function sanitizeFilename(filename: string | null | undefined, fallback = 'photo.jpg'): string {
  const base = String(filename || fallback)
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim();

  return base || fallback;
}

export function filenameFromHeader(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return sanitizeFilename(decodeURIComponent(utf8[1]), fallback);
  const quoted = value.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return sanitizeFilename(quoted[1], fallback);
  const plain = value.match(/filename=([^;]+)/i);
  return sanitizeFilename(plain?.[1], fallback);
}

export function downloadFilenameFromResponse(response: Response, fallback: string): string {
  return filenameFromHeader(response.headers.get('content-disposition'), fallback);
}

export function slugify(value: string): string {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'album';
}

/**
 * Twee albums met dezelfde naam mogen niet dezelfde slug krijgen; de tweede
 * wordt `-2`. De teller leeft per momentopname, zodat de slug van een album
 * niet verschuift zolang de albums ervoor niet veranderen.
 */
export function createSlugAllocator(): (title: string) => string {
  const counts = new Map<string, number>();

  return (title: string) => {
    const base = slugify(title);
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

export function dateValue(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

export function photoDate(asset: ImmichAsset): string | null {
  return asset.fileCreatedAt || asset.localDateTime || asset.exifInfo?.dateTimeOriginal || asset.createdAt || null;
}

export function assetDimensions(asset: ImmichAsset): { width: number; height: number } {
  const width = Number(asset.width || asset.exifInfo?.exifImageWidth || 1600);
  const height = Number(asset.height || asset.exifInfo?.exifImageHeight || 1067);

  return {
    width: Number.isFinite(width) && width > 0 ? width : 1600,
    height: Number.isFinite(height) && height > 0 ? height : 1067,
  };
}

export function fileTitle(filename: string): string {
  return sanitizeFilename(filename, 'foto.jpg')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripMarkers(description: string | null | undefined, markers: string[]): string {
  let raw = String(description || '');
  for (const marker of markers) {
    if (!marker) continue;
    raw = raw.split(marker).join('');
  }
  return raw
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
