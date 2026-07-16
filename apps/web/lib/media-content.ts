import 'server-only';

import { prisma } from '@vtk/db';

export type MediaVideo = {
  id: string;
  url: string;
  titleNl: string;
  titleEn?: string;
  posterUrl?: string;
  publishedAt?: string;
};

export type MediaPublicationKind = 'bakske' | 'ir-reeel';

export type MediaPublication = {
  id: string;
  kind: MediaPublicationKind;
  titleNl: string;
  titleEn?: string;
  issueNl: string;
  issueEn?: string;
  publishedAt?: string;
  pdfUrl?: string;
  storageKey?: string;
};

const DEFAULT_VIDEOS: MediaVideo[] = [
  {
    id: 'galabal-aftermovie',
    url: 'https://www.youtube.com/watch?v=WdGqhrVUJog',
    titleNl: 'Galabal aftermovie',
    titleEn: 'Gala aftermovie',
  },
  {
    id: 'jobfair-aftermovie',
    url: 'https://www.youtube.com/watch?v=9CyqfzXWYME',
    titleNl: 'Jobfair aftermovie',
    titleEn: 'Job fair aftermovie',
  },
];

const DEFAULT_PUBLICATIONS: MediaPublication[] = [
  {
    id: 'bakske-2025-2026-s2w6',
    kind: 'bakske',
    titleNl: 'Het Bakske',
    titleEn: 'Het Bakske',
    issueNl: 'Week 6 / Semester 2, 2025-2026',
    issueEn: 'Week 6 / Semester 2, 2025-2026',
    publishedAt: '2026-03-15',
    pdfUrl: 'https://vtk.be/_publications/pdf/a88e502ea825c3395a47cbb28d3a3ee96f9b81ee.pdf',
  },
  {
    id: 'bakske-2025-2026-s2w4',
    kind: 'bakske',
    titleNl: 'Het Bakske',
    titleEn: 'Het Bakske',
    issueNl: 'Week 4 / Semester 2, 2025-2026',
    issueEn: 'Week 4 / Semester 2, 2025-2026',
    publishedAt: '2026-03-01',
    pdfUrl: 'https://vtk.be/_publications/pdf/9a4677aa5dea8e0f3a7bf2a0c1812a6eae49142c.pdf',
  },
  {
    id: 'bakske-2025-2026-s2w3',
    kind: 'bakske',
    titleNl: 'Het Bakske',
    titleEn: 'Het Bakske',
    issueNl: 'Week 3 / Semester 2, 2025-2026',
    issueEn: 'Week 3 / Semester 2, 2025-2026',
    publishedAt: '2026-02-22',
    pdfUrl: 'https://vtk.be/_publications/pdf/a7f09c8575986b9b010d7ce5348b6d76fd13b3de.pdf',
  },
  {
    id: 'bakske-2025-2026-s1w2',
    kind: 'bakske',
    titleNl: 'Het Bakske',
    titleEn: 'Het Bakske',
    issueNl: 'Week 2 / Semester 1, 2025-2026',
    issueEn: 'Week 2 / Semester 1, 2025-2026',
    publishedAt: '2025-09-29',
    pdfUrl: 'https://vtk.be/_publications/pdf/a5251f173ff84324bef666dabc03484b91b35f15.pdf',
  },
  {
    id: 'ir-reeel-2025-september',
    kind: 'ir-reeel',
    titleNl: 'Ir.Reëel',
    titleEn: 'Ir.Reëel',
    issueNl: 'September 2025, 2025-2026',
    issueEn: 'September 2025, 2025-2026',
    publishedAt: '2025-09-01',
    pdfUrl: 'https://vtk.be/_publications/pdf/bea5a73905a541b43900d7529c0793a5e24a957a.pdf',
  },
  {
    id: 'ir-reeel-2024-2025-2',
    kind: 'ir-reeel',
    titleNl: 'Ir.Reëel',
    titleEn: 'Ir.Reëel',
    issueNl: 'Editie 2, 2024-2025',
    issueEn: 'Issue 2, 2024-2025',
    publishedAt: '2024-12-03',
    pdfUrl: 'https://vtk.be/_publications/pdf/fc365177942f2411e10340faf2613ba70d1221b8.pdf',
  },
  {
    id: 'ir-reeel-2023-2024-4',
    kind: 'ir-reeel',
    titleNl: 'Ir.Reëel',
    titleEn: 'Ir.Reëel',
    issueNl: 'Editie 4, 2023-2024',
    issueEn: 'Issue 4, 2023-2024',
    publishedAt: '2024-04-25',
    pdfUrl: 'https://vtk.be/_publications/pdf/81d2550a98e49f4bd35962a62e3d2c992e415b6d.pdf',
  },
];

type ParsedCollection<T> = {
  valid: boolean;
  items: T[];
};

const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const HTTPS_PROTOCOLS = new Set(['https:']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readString(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== 'string') return undefined;
  const result = value.trim();
  if (!result || result.length > maxLength) return undefined;
  return result;
}

function readId(value: unknown): string | undefined {
  const id = readString(value, 100);
  return id && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) ? id : undefined;
}

function readUrl(value: unknown, protocols: ReadonlySet<string>): string | undefined {
  const raw = readString(value, 2_048);
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (!protocols.has(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function readDate(value: unknown): string | undefined {
  const raw = readString(value, 100);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : undefined;
}

function readStorageKey(value: unknown): string | undefined {
  const key = readString(value, 1_024);
  if (!key || /[\u0000-\u001f\u007f]/.test(key)) return undefined;
  return key;
}

function readCollection(value: unknown, properties: readonly string[]): ParsedCollection<unknown> {
  if (Array.isArray(value)) return { valid: true, items: value };
  if (!isPlainRecord(value)) return { valid: false, items: [] };

  for (const property of properties) {
    if (!(property in value)) continue;
    const items = value[property];
    return Array.isArray(items) ? { valid: true, items } : { valid: false, items: [] };
  }

  return { valid: false, items: [] };
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function allocateVideoId(value: unknown, title: string, index: number, used: Set<string>): string {
  const base = readId(value) || slugify(title) || `video-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function parseVideos(value: unknown): ParsedCollection<MediaVideo> {
  const collection = readCollection(value, ['videos', 'items']);
  if (!collection.valid) return { valid: false, items: [] };

  const usedIds = new Set<string>();
  const videos: MediaVideo[] = [];

  for (const [index, item] of collection.items.entries()) {
    if (!isPlainRecord(item) || (item.type !== undefined && item.type !== 'video')) continue;
    const url = readUrl(item.url, WEB_PROTOCOLS);
    const titleNl = readString(item.titleNl);
    if (!url || !titleNl) continue;

    const titleEn = readString(item.titleEn);
    const posterUrl = readUrl(item.posterUrl, WEB_PROTOCOLS);
    const publishedAt = readDate(item.publishedAt);

    videos.push({
      id: allocateVideoId(item.id, titleNl, index, usedIds),
      url,
      titleNl,
      ...(titleEn ? { titleEn } : {}),
      ...(posterUrl ? { posterUrl } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
  }

  return { valid: true, items: videos };
}

function parsePublications(value: unknown): ParsedCollection<MediaPublication> {
  const collection = readCollection(value, ['publications', 'items']);
  if (!collection.valid) return { valid: false, items: [] };

  const usedIds = new Set<string>();
  const publications: MediaPublication[] = [];

  for (const item of collection.items) {
    if (!isPlainRecord(item)) continue;
    const id = readId(item.id);
    const kind = item.kind === 'bakske' || item.kind === 'ir-reeel' ? item.kind : undefined;
    const titleNl = readString(item.titleNl);
    const issueNl = readString(item.issueNl);
    const titleEn = readString(item.titleEn);
    const issueEn = readString(item.issueEn);
    const publishedAt = readDate(item.publishedAt);
    const pdfUrl = readUrl(item.pdfUrl, HTTPS_PROTOCOLS);
    const storageKey = readStorageKey(item.storageKey);
    if (!id || usedIds.has(id) || !kind || !titleNl || !issueNl || (!pdfUrl && !storageKey))
      continue;

    usedIds.add(id);
    publications.push({
      id,
      kind,
      titleNl,
      issueNl,
      ...(titleEn ? { titleEn } : {}),
      ...(issueEn ? { issueEn } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(pdfUrl ? { pdfUrl } : {}),
      ...(storageKey ? { storageKey } : {}),
    });
  }

  return { valid: true, items: publications };
}

export async function getMediaContent(): Promise<{
  videos: MediaVideo[];
  publications: MediaPublication[];
}> {
  let rows: Array<{ key: string; value: unknown }>;
  try {
    rows = await prisma.setting.findMany({
      where: {
        key: { in: ['media.aftermovies', 'home.aftermovies', 'media.magazines'] },
      },
    });
  } catch {
    return {
      videos: DEFAULT_VIDEOS.map((item) => ({ ...item })),
      publications: DEFAULT_PUBLICATIONS.map((item) => ({ ...item })),
    };
  }
  const settings = new Map(
    rows.map((row: { key: string; value: unknown }) => [row.key, row.value])
  );

  const preferredVideos = settings.has('media.aftermovies')
    ? parseVideos(settings.get('media.aftermovies'))
    : { valid: false, items: [] as MediaVideo[] };
  const legacyVideos = parseVideos(settings.get('home.aftermovies'));
  const videos = preferredVideos.valid
    ? preferredVideos.items
    : legacyVideos.valid
      ? legacyVideos.items
      : DEFAULT_VIDEOS.map((item) => ({ ...item }));
  const configuredPublications = parsePublications(settings.get('media.magazines'));
  const publications = configuredPublications.valid
    ? configuredPublications.items
    : DEFAULT_PUBLICATIONS.map((item) => ({ ...item }));

  return { videos, publications };
}
