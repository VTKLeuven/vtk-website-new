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

export type ParsedAlbumMarkers = {
  parent?: string;
  group?: string;
  tab?: string;
  titlePrefix?: string;
  titleSuffix?: string;
};

export function parseAlbumMarkers(description: string | null | undefined, title = ''): ParsedAlbumMarkers {
  const desc = String(description || '');
  const result: ParsedAlbumMarkers = {};

  const parentMatch = desc.match(/\[parent:\s*([^\]]+)\]/i);
  if (parentMatch?.[1]) {
    result.parent = parentMatch[1].trim();
  }

  const groupMatch = desc.match(/\[group:\s*([^\]]+)\]/i);
  if (groupMatch?.[1]) {
    result.group = groupMatch[1].trim();
  }

  const tabMatch = desc.match(/\[tab:\s*([^\]]+)\]/i);
  if (tabMatch?.[1]) {
    result.tab = tabMatch[1].trim();
  }

  const trimmedTitle = title.trim();
  const delimiterMatch = trimmedTitle.match(/^(.+?)\s*(?:::|:|\/\/)\s*(.+)$/);
  if (delimiterMatch?.[1] && delimiterMatch?.[2]) {
    result.titlePrefix = delimiterMatch[1].trim();
    result.titleSuffix = delimiterMatch[2].trim();
  }

  return result;
}

export type AlbumMarkerName = 'parent' | 'group' | 'tab';

/**
 * Zet, vervangt of verwijdert één merker in een albumbeschrijving.
 *
 * Bewerken moet een merker kunnen **herschrijven** zonder de rest van de
 * beschrijving of de andere merkers aan te raken: een tab hernoemen mag de
 * `[gallery]`-merker niet kwijtspelen, want dan verdwijnt het album van de site.
 * `null` of een lege waarde haalt de merker weg. Een nieuwe merker komt achteraan,
 * op een eigen regel, zoals de uploader ze al schreef.
 */
export function setMarker(
  description: string | null | undefined,
  name: AlbumMarkerName,
  value: string | null,
): string {
  const raw = String(description || '');
  const pattern = new RegExp(`\\[${name}:\\s*[^\\]]*\\]`, 'gi');
  const trimmed = String(value || '').trim();
  const marker = trimmed ? `[${name}: ${trimmed}]` : '';

  let replaced = false;
  let next = raw.replace(pattern, () => {
    if (replaced || !marker) return '';
    replaced = true;
    return marker;
  });

  if (marker && !replaced) {
    next = next.trim() ? `${next.trim()}\n\n${marker}` : marker;
  }

  return tidyDescription(next);
}

/** Dubbele spaties en lege regels die het weghalen van een merker achterlaat. */
function tidyDescription(value: string): string {
  return value
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Wisselt de galerijmerker van een album, bijvoorbeeld `[gallery]` voor
 * `[gallery-uit]`. Staat geen van beide erin, dan komt de nieuwe erbij.
 */
export function swapMarker(description: string | null | undefined, from: string, to: string): string {
  const raw = String(description || '');
  if (raw.includes(from)) return tidyDescription(raw.split(from).join(to));
  if (raw.includes(to)) return tidyDescription(raw);
  return tidyDescription(raw.trim() ? `${raw.trim()}\n\n${to}` : to);
}

export function stripMarkers(description: string | null | undefined, markers: string[]): string {
  let raw = String(description || '');
  for (const marker of markers) {
    if (!marker) continue;
    raw = raw.split(marker).join('');
  }
  raw = raw.replace(/\[(parent|group|tab):\s*[^\]]+\]/gi, '');

  return raw
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
