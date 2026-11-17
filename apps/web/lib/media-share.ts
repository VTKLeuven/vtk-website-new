import "server-only";

import type { GalleryShareAudience, Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { assetDimensions, dateValue, fileTitle, photoDate, sanitizeFilename, slugify } from "@vtk/gallery";
import { listImmichAlbumAssets } from "@/lib/immich-gallery";
import { loadLibraryAlbums } from "@/lib/media-admin";
import { isShareToken } from "@/lib/media-share-shared";
import { hashShareToken } from "@/lib/media-share-token";
import { decryptSecret } from "@/lib/secrets";
import { siteUrl } from "@/lib/seo";
import { currentWorkingYear } from "@/lib/workingYear";

/**
 * Privélinks naar een album: een adres op vtk.be voor wie het krijgt, met een
 * vervaldatum, eventueel enkel voor het praesidium of één werkgroep. De pagina
 * staat in `app/[locale]/media/gedeeld/[token]`, de foto's en de zip lopen via
 * `app/api/immich-gallery/gedeeld/[token]`. Zie docs/immich-gallery.md, "Een
 * album delen met een link".
 *
 * Bewust geen gedeelde link van Immich zelf: die weet niet wie er kijkt, telt
 * niets, en haar sleutel in elke foto-URL opent het hele album op de fotoproxy.
 * Hier lopen de foto's via de site, met de API-sleutel, na elke controle.
 */

/** Een link zoals de pagina en de routes hem nodig hebben; zonder het geheim. */
export type ResolvedShareLink = {
  id: string;
  albumId: string;
  audience: GalleryShareAudience;
  groupId: string | null;
  allowDownload: boolean;
  expiresAt: Date;
};

/**
 * De link achter een token, of `null` wanneer hij niet bestaat of verlopen is.
 * Wie de link niet heeft, krijgt in beide gevallen hetzelfde scherm: de pagina
 * verraadt niet of een token ooit bestond.
 */
export async function findShareLink(token: string, now = new Date()): Promise<ResolvedShareLink | null> {
  if (!isShareToken(token)) return null;
  const link = await prisma.galleryShareLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
    select: {
      id: true,
      gallery: true,
      albumId: true,
      audience: true,
      groupId: true,
      allowDownload: true,
      expiresAt: true,
    },
  });
  if (!link || link.gallery !== "MAIN" || link.expiresAt <= now) return null;
  return {
    id: link.id,
    albumId: link.albumId,
    audience: link.audience,
    groupId: link.groupId,
    allowDownload: link.allowDownload,
    expiresAt: link.expiresAt,
  };
}

export type ShareAccess = { ok: true } | { ok: false; reason: "login" | "forbidden" };

/**
 * Mag deze bezoeker binnen?
 *
 * Het lidmaatschap telt in het werkingsjaar van vandaag, bij elk bezoek opnieuw:
 * wie later bij de werkgroep komt, kan meteen kijken, en wie eruit gaat niet
 * meer. Daarom loopt geen link voorbij 15 juli (`shareExpiry`). Een werkgroeplink
 * zonder werkgroep laat niemand binnen; de CHECK in de migratie houdt die er
 * normaal uit, maar dicht is hier de enige veilige kant.
 */
export async function checkShareAccess(
  link: Pick<ResolvedShareLink, "audience" | "groupId">,
  userId: string | null,
  now = new Date(),
): Promise<ShareAccess> {
  if (link.audience === "LINK") return { ok: true };
  if (!userId) return { ok: false, reason: "login" };
  if (link.audience === "GROUP" && !link.groupId) return { ok: false, reason: "forbidden" };

  const year = currentWorkingYear(now);
  const where: Prisma.GroupMembershipWhereInput =
    link.audience === "PRAESIDIUM"
      ? { userId, year, group: { type: "PRAESIDIUM" } }
      : { userId, year, groupId: link.groupId ?? undefined };
  const membership = await prisma.groupMembership.findFirst({ where, select: { id: true } });
  return membership ? { ok: true } : { ok: false, reason: "forbidden" };
}

export type SharedPhoto = { id: string; title: string; filename: string; width: number; height: number };
export type SharedPart = { id: string; name: string; slug: string; photos: SharedPhoto[] };
export type SharedAlbum = {
  id: string;
  title: string;
  description: string;
  date: string | null;
  parts: SharedPart[];
};

/**
 * Het album zoals een link het toont: de zichtbare foto's van elk deel, recht uit
 * Immich. Een verborgen foto is uit haar album gehaald (`GalleryDetachedPhoto`)
 * en staat hier dus vanzelf niet in; een album in de prullenmand bestaat hier
 * niet (`loadLibraryAlbums` laat het weg). Enkel foto's, zoals op /media.
 */
async function readSharedAlbum(albumId: string): Promise<SharedAlbum | null> {
  const albums = await loadLibraryAlbums();
  const album = albums.find((item) => item.id === albumId);
  if (!album) return null;

  const parts = await Promise.all(
    album.parts.map(async (part) => {
      const assets = await listImmichAlbumAssets(part.id);
      const photos = assets
        .filter((asset) => !asset.type || asset.type === "IMAGE")
        .sort((left, right) => dateValue(photoDate(left)) - dateValue(photoDate(right)))
        .map((asset, index) => {
          const filename = sanitizeFilename(asset.originalFileName, `foto-${index + 1}.jpg`);
          const { width, height } = assetDimensions(asset);
          return { id: asset.id, title: fileTitle(filename), filename, width, height };
        });
      return { id: part.id, name: part.name, photos };
    }),
  );

  // Een tab heeft op de pagina een eigen adres (`?sub=`); dat hoort leesbaar te
  // zijn en mag het Immich-id niet tonen.
  const used = new Set<string>();
  const withSlugs = parts.map((part, index) => {
    const base = slugify(part.name) || `tab-${index + 1}`;
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return { ...part, slug };
  });

  return { id: album.id, title: album.title, description: album.description, date: album.date, parts: withSlugs };
}

/**
 * Een paar minuten in het geheugen: een raster van tweehonderd foto's vraagt
 * tweehonderd keer na of een foto bij het album hoort, en dat mag geen
 * tweehonderd albumlezingen kosten. De pagina leest altijd vers en vult zo de
 * cache voor de foto's die meteen volgen. Wat je verbergt, verdwijnt dus pas na
 * hoogstens die paar minuten uit de foto-route.
 */
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 50;
const albumCache = new Map<string, { at: number; album: SharedAlbum | null }>();

export async function loadSharedAlbum(albumId: string, { fresh = false } = {}): Promise<SharedAlbum | null> {
  const hit = albumCache.get(albumId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.album;
  const album = await readSharedAlbum(albumId);
  albumCache.delete(albumId);
  albumCache.set(albumId, { at: Date.now(), album });
  if (albumCache.size > CACHE_MAX) {
    const oldest = albumCache.keys().next().value;
    if (oldest) albumCache.delete(oldest);
  }
  return album;
}

/**
 * De foto in het album van de link, of `null`. Dit is de controle die de route
 * van een link onderscheidt van de thumbnailroute van het beheer: die neemt elk
 * Immich-id aan, en een link naar één album mag niet elke foto in Immich openen.
 */
export function findSharedPhoto(album: SharedAlbum, assetId: string): SharedPhoto | null {
  for (const part of album.parts) {
    const photo = part.photos.find((item) => item.id === assetId);
    if (photo) return photo;
  }
  return null;
}

/** Een opening tellen: hoe vaak en wanneer laatst, nooit wie. */
export async function recordShareOpen(linkId: string): Promise<void> {
  await prisma.galleryShareLink
    .update({ where: { id: linkId }, data: { openCount: { increment: 1 }, lastOpenedAt: new Date() } })
    .catch((error) => console.error("Share link: open count failed", linkId, error));
}

/** Het volledige adres van een link, voor het beheer en de testdata. */
export function shareLinkUrl(token: string): string {
  return `${siteUrl()}/media/gedeeld/${token}`;
}

/** De link opnieuw tonen; `null` wanneer het geheim niet meer te ontsleutelen is. */
function revealShareUrl(tokenSecret: string): string | null {
  try {
    return shareLinkUrl(decryptSecret(tokenSecret));
  } catch {
    // `BETTER_AUTH_SECRET` gewisseld: de link werkt nog (de hash), maar het
    // beheer kan hem niet meer tonen. Het scherm zegt dan dat je een nieuwe maakt.
    return null;
  }
}

/** Eén link zoals het beheer hem toont. Gaat naar de browser, maar enkel in het beheer. */
export type ShareLinkRow = {
  id: string;
  label: string;
  audience: GalleryShareAudience;
  groupId: string | null;
  groupName: string | null;
  allowDownload: boolean;
  expiresAt: string;
  openCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  url: string | null;
};

/** De links van één album: de werkende eerst, de nieuwste bovenaan, de verlopen onderaan. */
export async function listShareLinks(albumId: string, locale: string, now = new Date()): Promise<ShareLinkRow[]> {
  const rows = await prisma.galleryShareLink.findMany({
    where: { gallery: "MAIN", albumId },
    orderBy: { createdAt: "desc" },
    include: {
      group: { select: { nameNl: true, nameEn: true } },
      createdBy: { select: { name: true } },
    },
  });
  const active = rows.filter((row) => row.expiresAt > now);
  const expired = rows.filter((row) => row.expiresAt <= now);
  return [...active, ...expired].map((row) => ({
    id: row.id,
    label: row.label,
    audience: row.audience,
    groupId: row.groupId,
    groupName: row.group ? (locale === "en" ? row.group.nameEn || row.group.nameNl : row.group.nameNl) : null,
    allowDownload: row.allowDownload,
    expiresAt: row.expiresAt.toISOString(),
    openCount: row.openCount,
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy?.name ?? null,
    url: revealShareUrl(row.tokenSecret),
  }));
}

/** De albums met minstens één werkende link, voor het icoon en de filter in de lijst. */
export async function sharedAlbumIds(now = new Date()): Promise<Set<string>> {
  const rows = await prisma.galleryShareLink.findMany({
    where: { gallery: "MAIN", expiresAt: { gt: now } },
    select: { albumId: true },
    distinct: ["albumId"],
  });
  return new Set(rows.map((row) => row.albumId));
}

/** De werkgroepen voor de keuzelijst: enkel de actieve. */
export async function listShareWerkgroepen(locale: string): Promise<Array<{ id: string; name: string }>> {
  const groups = await prisma.group.findMany({
    where: { type: "WERKGROEP", active: true },
    select: { id: true, nameNl: true, nameEn: true },
    orderBy: { nameNl: "asc" },
  });
  return groups.map((group) => ({ id: group.id, name: locale === "en" ? group.nameEn || group.nameNl : group.nameNl }));
}
