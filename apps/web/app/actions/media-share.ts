"use server";

/**
 * Privélinks naar een album maken, aanpassen en intrekken, vanuit het album in
 * /admin/media. Zie `lib/media-share.ts` en docs/immich-gallery.md, "Een album
 * delen met een link".
 *
 * Dezelfde rechten als de rest van het albumbeheer en geen eigen recht: wie een
 * album als zip kan downloaden, kan het nu al doorsturen, en een link is daar de
 * veiligere vorm van (een vervaldatum, intrekken, enkel de zichtbare foto's).
 */

import { revalidatePath } from "next/cache";
import type { GalleryShareAudience } from "@prisma/client";
import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import { loadLibraryAlbums } from "@/lib/media-admin";
import { SHARE_LABEL_MAX, isShareAudience, isShareTerm, shareExpiry } from "@/lib/media-share-shared";
import { createShareToken, hashShareToken } from "@/lib/media-share-token";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { encryptSecret } from "@/lib/secrets";
import { requireAnyPermission } from "@/lib/session";

const ALBUM_PERMISSIONS = ["media.manage", "photos.manageAlbums"] as const;

const AUDIENCE_SUMMARY: Record<GalleryShareAudience, string> = {
  LINK: "iedereen met de link",
  PRAESIDIUM: "enkel het praesidium",
  GROUP: "enkel één werkgroep",
};

function readField(formData: FormData, name: string, max = 200): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

/**
 * Wie er binnen mag. Bij een werkgroep ook de werkgroep zelf, en die moet een
 * werkgroep zijn: een post of jaarwerking kiezen kan (nog) niet, zie
 * docs/design-decisions.md.
 */
async function readAudience(
  formData: FormData,
): Promise<{ audience: GalleryShareAudience; groupId: string | null } | { error: string }> {
  const audience = readField(formData, "audience", 20);
  if (!isShareAudience(audience)) return { error: "INVALID_INPUT" };
  if (audience !== "GROUP") return { audience, groupId: null };
  const groupId = readField(formData, "groupId", 100);
  if (!groupId) return { error: "GROUP_REQUIRED" };
  const group = await prisma.group.findFirst({ where: { id: groupId, type: "WERKGROEP" }, select: { id: true } });
  if (!group) return { error: "GROUP_MISSING" };
  return { audience, groupId };
}

/** Het album en de lijst links: het icoon en de filter Gedeeld veranderen mee. */
function refresh(): void {
  revalidatePath("/[locale]/admin/media", "layout");
}

export async function createShareLinkAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const label = readField(formData, "label", SHARE_LABEL_MAX);
  const term = readField(formData, "term", 20);
  if (!albumId || !isShareTerm(term)) return saveError("INVALID_INPUT");
  if (!label) return saveError("LABEL_REQUIRED");
  const audience = await readAudience(formData);
  if ("error" in audience) return saveError(audience.error);

  let albumTitle: string;
  try {
    const album = (await loadLibraryAlbums()).find((item) => item.id === albumId);
    if (!album) return saveError("ALBUM_MISSING");
    albumTitle = album.title;
  } catch (error) {
    console.error("Share link: album could not be loaded", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  const token = createShareToken();
  const link = await prisma.galleryShareLink.create({
    data: {
      gallery: "MAIN",
      albumId,
      label,
      tokenHash: hashShareToken(token),
      tokenSecret: encryptSecret(token),
      audience: audience.audience,
      groupId: audience.groupId,
      allowDownload: formData.get("allowDownload") === "true",
      expiresAt: shareExpiry(term, new Date()),
      createdById: session.user.id,
    },
    select: { id: true },
  });

  await logAudit({
    action: "create",
    entity: "photoAlbumShareLink",
    entityId: link.id,
    target: label,
    summary: `privélink naar "${albumTitle}" gemaakt, ${AUDIENCE_SUMMARY[audience.audience]}`,
  });
  refresh();
  return saveOk();
}

/**
 * Aanpassen houdt het token: wie de link al heeft, hoeft geen nieuwe te krijgen.
 * Een lege termijn laat de vervaldatum staan; een termijn rekent vanaf vandaag,
 * zodat een verlopen link met dezelfde URL weer werkt.
 */
export async function updateShareLinkAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const id = readField(formData, "id", 100);
  const label = readField(formData, "label", SHARE_LABEL_MAX);
  const term = readField(formData, "term", 20);
  if (!id || (term && !isShareTerm(term))) return saveError("INVALID_INPUT");
  if (!label) return saveError("LABEL_REQUIRED");
  const audience = await readAudience(formData);
  if ("error" in audience) return saveError(audience.error);

  const existing = await prisma.galleryShareLink.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return saveError("LINK_MISSING");

  await prisma.galleryShareLink.update({
    where: { id },
    data: {
      label,
      audience: audience.audience,
      groupId: audience.groupId,
      allowDownload: formData.get("allowDownload") === "true",
      ...(isShareTerm(term) ? { expiresAt: shareExpiry(term, new Date()) } : {}),
    },
  });

  await logAudit({
    action: "update",
    entity: "photoAlbumShareLink",
    entityId: id,
    target: label,
    summary: `privélink aangepast, ${AUDIENCE_SUMMARY[audience.audience]}${isShareTerm(term) ? ", verlengd" : ""}`,
  });
  refresh();
  return saveOk();
}

/** Intrekken is verwijderen: de URL werkt meteen niet meer, het album blijft staan. */
export async function revokeShareLinkAction(formData: FormData): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const id = readField(formData, "id", 100);
  const link = id
    ? await prisma.galleryShareLink.findUnique({ where: { id }, select: { id: true, label: true } })
    : null;
  if (!link) return saveError("LINK_MISSING");

  await prisma.galleryShareLink.delete({ where: { id } });
  await logAudit({
    action: "revoke",
    entity: "photoAlbumShareLink",
    entityId: id,
    target: link.label,
    summary: "privélink ingetrokken",
  });
  refresh();
  return saveOk();
}
