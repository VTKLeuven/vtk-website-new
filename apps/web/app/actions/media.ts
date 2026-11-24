"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@vtk/db";
import { deleteObject, newStorageKey, putObject } from "@vtk/storage";
import { requireAnyPermission, requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import {
  ensureMagazineCover,
  ensureMagazinePages,
  renderPdfCover,
  storeCover,
} from "@/lib/magazineCover";
import {
  getMediaContent,
  type MediaPublication,
  type MediaPublicationKind,
} from "@/lib/media-content";
import {
  ALBUM_CREATE_PERMISSIONS,
  ALBUM_MANAGE_PERMISSIONS,
  ALBUM_UPLOAD_PERMISSIONS,
  albumRights,
} from "@/lib/media-album-access";
import {
  addImmichAssetsToAlbum,
  createImmichGalleryAlbum,
  galleryAlbumVisibilityOf,
  getImmichGalleryAlbum,
  getManageableGalleryAlbum,
  refreshImmichGallerySnapshot,
  setImmichAlbumCover,
  setMarker,
  succeededAssetIds,
  updateImmichAlbum,
  uploadImmichAsset,
} from "@/lib/immich-gallery";
import { fakbarGallery, fakbarUploadEnabled, setFakbarUploadEnabled } from "@/lib/fakbar-gallery";

const MAX_PDF_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 45 * 1024 * 1024;
const IMMICH_ADMIN_DEVICE_ID = "vtk-web-admin";

/**
 * Naar welke fotogalerij een upload gaat. Standaard die van vtk.be; "fakbar"
 * kan alleen wanneer de schakelaar in /admin/media aanstaat (zie
 * lib/fakbar-gallery.ts). De keuze wordt hier server-side hertoetst en niet op
 * het formulier vertrouwd: een uitgezette schakelaar moet ook standhouden als
 * iemand het verborgen veld zelf meestuurt.
 */
type GalleryTarget = "main" | "fakbar";

async function readGalleryTarget(formData: FormData): Promise<GalleryTarget | null> {
  const raw = formData.get("gallery");
  if (raw !== "fakbar") return "main";
  return (await fakbarUploadEnabled()) ? "fakbar" : null;
}

function slugifyId(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "editie";
}

function readField(formData: FormData, name: string, max = 200): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function savePublications(publications: MediaPublication[]): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "media.magazines" },
    update: { value: { publications } },
    create: { key: "media.magazines", value: { publications } },
  });
  revalidatePath("/media");
  revalidatePath("/en/media");
}

export async function saveMagazineAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("media.manage");

  const kindRaw = readField(formData, "kind", 20);
  const kind: MediaPublicationKind | null =
    kindRaw === "bakske" || kindRaw === "ir-reeel" ? kindRaw : null;
  const titleNl = readField(formData, "titleNl");
  const titleEn = readField(formData, "titleEn");
  const issueNl = readField(formData, "issueNl");
  const issueEn = readField(formData, "issueEn");
  const publishedAt = readField(formData, "publishedAt", 30);
  const file = formData.get("file");

  if (!kind || !titleNl || !issueNl) return { ok: false, error: "missing_fields" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "missing_pdf" };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "pdf_too_large" };
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return { ok: false, error: "not_a_pdf" };
  if (publishedAt && !Number.isFinite(Date.parse(publishedAt))) {
    return { ok: false, error: "invalid_date" };
  }

  // Persist the currently visible list so the first edit keeps what the
  // public page already shows (including the built-in fallback issues).
  const { publications: current } = await getMediaContent();

  const usedIds = new Set(current.map((p) => p.id));
  const base = slugifyId(`${kind}-${issueNl}`);
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  const storageKey = newStorageKey("publications", file.name || "magazine.pdf");
  const bytes = Buffer.from(await file.arrayBuffer());
  await putObject(storageKey, bytes, "application/pdf");
  // De kaft voor de tegel in het nieuws, van bladzijde 1 (lib/magazineCover.ts).
  // Lukt dat niet (een kapotte of beveiligde pdf), dan gaat de editie zonder
  // kaft op; een editie zonder kaft is nog altijd een editie.
  let coverKey: string | null = null;
  try {
    coverKey = await storeCover(await renderPdfCover(new Uint8Array(bytes)));
  } catch (error) {
    console.error(`[media] kaft bij het uploaden van ${id} niet gemaakt:`, error);
  }

  const entry: MediaPublication = {
    id,
    kind,
    titleNl,
    issueNl,
    storageKey,
    ...(coverKey ? { coverKey } : {}),
    ...(titleEn ? { titleEn } : {}),
    ...(issueEn ? { issueEn } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };

  await savePublications([entry, ...current]);
  await logAudit({
    action: "create",
    entity: "media",
    entityId: id,
    target: `${titleNl} ${issueNl}`,
    summary: `${kind === "bakske" ? "'t Bakske" : "Ir-Reëel"} toegevoegd aan de mediapagina`,
  });
  // De bladzijden voor de lezer in de app, na het antwoord: een dik nummer is
  // tien seconden rekenen, en daar hoeft wie uploadt niet op te wachten. Lukt
  // het niet, dan pikt de onderhoudstaak het op.
  after(() => ensureMagazinePages(id));
  return { ok: true };
}

/**
 * De kaft van een editie opnieuw maken van bladzijde 1, bv. nadat de pdf
 * vervangen werd. Een editie zonder kaft krijgt er ook vanzelf een zodra het
 * nieuws haar toont (`ensureMagazineCover`); dit is de knop om niet te wachten.
 */
export async function setMagazineCoverAction(formData: FormData): Promise<SaveState> {
  await requirePermission("media.manage");
  const id = readField(formData, "id", 100);
  const { publications: current } = await getMediaContent();
  const target = current.find((p) => p.id === id);
  if (!target) return saveError("NOT_FOUND");
  const previous = target.coverKey;
  // Zonder de oude sleutel maakt ensureMagazineCover er een nieuwe.
  if (previous) {
    await savePublications(current.map((p) => (p.id === id ? { ...p, coverKey: undefined } : p)));
  }
  const coverKey = await ensureMagazineCover(id, { force: true });
  if (!coverKey) {
    if (previous) await savePublications(current);
    return saveError("INVALID_COVER");
  }
  if (previous) {
    try {
      await deleteObject(previous);
    } catch {
      /* een achtergebleven kaft is geen opslaanfout */
    }
  }
  await logAudit({
    action: "update",
    entity: "media",
    entityId: id,
    target: `${target.titleNl} ${target.issueNl}`,
    summary: "kaft gemaakt van bladzijde 1",
  });
  revalidatePath("/[locale]/admin/media", "layout");
  revalidatePath("/media");
  revalidatePath("/en/media");
  return saveOk();
}

export async function deleteMagazineAction(formData: FormData): Promise<void> {
  await requirePermission("media.manage");
  const id = readField(formData, "id", 100);
  if (!id) return;
  const { publications: current } = await getMediaContent();
  const removed = current.find((p) => p.id === id);
  await savePublications(current.filter((p) => p.id !== id));
  await logAudit({
    action: "delete",
    entity: "media",
    entityId: id,
    target: removed ? `${removed.titleNl} ${removed.issueNl}` : id,
    summary: "publicatie van de mediapagina gehaald",
  });
  revalidatePath("/[locale]/admin/media", "layout");
}

export async function savePromoVideosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("media.manage");

  const existing = await prisma.setting.findUnique({ where: { key: "media.aftermovies" } });
  const existingValue =
    existing && typeof existing.value === "object" && existing.value !== null && !Array.isArray(existing.value)
      ? (existing.value as Record<string, unknown>)
      : {};

  const items: Array<Record<string, string>> = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    const url = readField(formData, `url-${i}`, 2048);
    const titleNl = readField(formData, `titleNl-${i}`);
    if (!url || !titleNl) continue;
    const titleEn = readField(formData, `titleEn-${i}`);
    const publishedAt = readField(formData, `publishedAt-${i}`, 30);
    const savedId = readField(formData, `id-${i}`, 100);
    const base =
      savedId && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(savedId) ? savedId : slugifyId(titleNl);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    items.push({
      id,
      type: "video",
      url,
      titleNl,
      ...(titleEn ? { titleEn } : {}),
      ...(publishedAt && Number.isFinite(Date.parse(publishedAt)) ? { publishedAt } : {}),
    });
  }

  await prisma.setting.upsert({
    where: { key: "media.aftermovies" },
    update: { value: { ...existingValue, items } },
    create: {
      key: "media.aftermovies",
      value: { titleNl: "Aftermovies", titleEn: "Aftermovies", items },
    },
  });
  await logAudit({
    action: "update",
    entity: "media",
    target: "Promovideo's",
    summary: `${items.length} video('s) op de mediapagina`,
  });
  revalidatePath("/");
  revalidatePath("/media");
  revalidatePath("/en/media");
  revalidatePath("/[locale]/admin/media", "layout");
  return saveOk();
}

/**
 * Mag deze upload naar dit Immich-album? Het id komt uit de browser, en wie
 * enkel `photos.upload` heeft, mocht anders in elk album van Immich schrijven:
 * dat van de fakbar, een album dat in de prullenmand ligt, of een album dat
 * helemaal niet bij de site hoort. Een album van vtk.be moet dus een van onze
 * merkers dragen en niet in de prullenmand liggen; een fakbaralbum enkel voor
 * wie albums mag aanmaken, want enkel die komt er via het nieuwe-albumvenster.
 */
async function canUploadInto(
  albumId: string,
  target: GalleryTarget | null,
  canCreate: boolean,
): Promise<boolean> {
  if (target === "fakbar") {
    return canCreate && (await fakbarGallery.albumVisibilityOf(albumId).catch(() => null)) !== null;
  }
  if (target !== "main") return false;
  const [visibility, trashed] = await Promise.all([
    galleryAlbumVisibilityOf(albumId).catch(() => null),
    prisma.galleryTrashedAlbum.findFirst({
      where: { OR: [{ albumId }, { partIds: { has: albumId } }] },
      select: { id: true },
    }),
  ]);
  return visibility !== null && !trashed;
}

/**
 * Een nieuw album. Wie enkel albums mag aanmaken (`photos.createAlbums`), krijgt
 * het altijd verborgen, wat het formulier ook meestuurt: op de site zetten is
 * publiceren, en dat blijft bij wie albums beheert.
 */
export async function createImmichAlbumAction(
  formData: FormData
): Promise<{ ok: boolean; albumId?: string; error?: string }> {
  const session = await requireAnyPermission([...ALBUM_CREATE_PERMISSIONS]);
  const rights = albumRights(session);
  const title = readField(formData, "title");
  let description = readField(formData, "description", 1000);
  const parentSlug = readField(formData, "parentSlug", 100);
  const tabName = readField(formData, "tabName", 100);
  const parentTabName = readField(formData, "parentTabName", 50);

  if (parentSlug) {
    const parentMarker = `[parent: ${parentSlug}]`;
    const tabMarker = tabName ? ` [tab: ${tabName}]` : "";
    description = description ? `${description}\n\n${parentMarker}${tabMarker}` : `${parentMarker}${tabMarker}`;
  } else if (tabName) {
    const tabMarker = `[tab: ${tabName}]`;
    description = description ? `${description}\n\n${tabMarker}` : tabMarker;
  }

  if (!title) return { ok: false, error: "missing_title" };
  const target = await readGalleryTarget(formData);
  if (!target) return { ok: false, error: "fakbar_upload_disabled" };
  // "Eerst nakijken": het album krijgt meteen de uit-merker en staat pas op de
  // site wanneer iemand het in het beheer aanzet. Standaard staat het er meteen.
  const hidden = !rights.manage || formData.get("visible") === "false";
  try {
    const album =
      target === "fakbar"
        ? await fakbarGallery.createAlbum({ title, description, hidden })
        : await createImmichGalleryAlbum({ title, description, hidden });

    // Het hoofdalbum draagt zelf ook een tabnaam. Zonder die merker heet zijn
    // eigen tab op de site "Algemeen" (zie grouping.ts), en er was geen enkel
    // scherm waar je dat nog kon invullen.
    if (target === "main" && parentSlug && parentTabName) {
      const parent = await getImmichGalleryAlbum(parentSlug).catch(() => null);
      const parentRow = parent ? await getManageableGalleryAlbum(parent.id).catch(() => null) : null;
      if (parentRow) {
        await updateImmichAlbum(parent!.id, {
          description: setMarker(parentRow.description, "tab", parentTabName),
        }).catch((error) => console.error("Immich parent tab update failed", error));
      }
    }

    await logAudit({
      action: "create",
      entity: "photoAlbum",
      entityId: album.id,
      target: title,
      summary:
        target === "fakbar"
          ? "fotoalbum aangemaakt in Immich voor de fakbargalerij"
          : "fotoalbum aangemaakt in Immich",
    });
    // Het nieuwe album hoort meteen in de lijst links van het beheer, ook nog
    // zonder foto's.
    revalidatePath("/[locale]/admin/media", "layout");
    return { ok: true, albumId: album.id };
  } catch (error) {
    console.error("Immich album creation failed", error);
    return { ok: false, error: "immich_unreachable" };
  }
}

export async function uploadImmichAlbumAssetAction(
  formData: FormData
): Promise<{ ok: boolean; assetId?: string; error?: string }> {
  const session = await requireAnyPermission([...ALBUM_UPLOAD_PERMISSIONS]);
  const albumId = readField(formData, "albumId", 100);
  const file = formData.get("file");
  if (!albumId || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing" };
  }
  const target = await readGalleryTarget(formData);
  if (!(await canUploadInto(albumId, target, albumRights(session).create))) {
    return { ok: false, error: "album_not_allowed" };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return { ok: false, error: "unsupported_type" };
  }

  try {
    const uploaded = await uploadImmichAsset({
      assetData: file,
      filename: file.name || "photo.jpg",
      mimeType: file.type || "image/jpeg",
      deviceAssetId: `${IMMICH_ADMIN_DEVICE_ID}-${randomUUID()}`,
      deviceId: IMMICH_ADMIN_DEVICE_ID,
      createdAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    });
    if (!uploaded?.id) return { ok: false, error: "upload_failed" };
    // Immich antwoordt hier met HTTP 200 en een resultaat per foto: een asset
    // die niet in het album raakt, zou anders stil als gelukt tellen en nergens
    // op de site verschijnen.
    const added = succeededAssetIds(await addImmichAssetsToAlbum(albumId, [uploaded.id]));
    if (added.length === 0) return { ok: false, error: "album_add_failed" };
    return { ok: true, assetId: uploaded.id };
  } catch (error) {
    console.error("Immich asset upload failed", error);
    return { ok: false, error: "upload_failed" };
  }
}

export async function setImmichAlbumCoverAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  // Geen scherm roept dit nog aan (de cover zet je met `setAlbumCoverAction`);
  // daarom enkel voor wie albums beheert, in plaats van de kladregel te herhalen.
  await requireAnyPermission([...ALBUM_MANAGE_PERMISSIONS]);
  const albumId = readField(formData, "albumId", 100);
  const assetId = readField(formData, "assetId", 100);
  if (!albumId || !assetId) return { ok: false, error: "missing" };
  try {
    await setImmichAlbumCover(albumId, assetId);
    await logAudit({
      action: "update",
      entity: "photoAlbum",
      entityId: albumId,
      target: albumId,
      summary: "coverfoto van het album gewijzigd",
    });
    return { ok: true };
  } catch (error) {
    console.error("Immich album cover update failed", error);
    return { ok: false, error: "cover_failed" };
  }
}

export async function finalizeImmichAlbumAction(formData?: FormData): Promise<void> {
  await requireAnyPermission([...ALBUM_UPLOAD_PERMISSIONS]);
  // Ververst de momentopname van de galerij waarin net geüpload is. De andere
  // met rust laten scheelt een volledige Immich-uitlezing per upload.
  if (formData?.get("gallery") === "fakbar") {
    await fakbarGallery.refreshSnapshot();
    return;
  }
  await refreshImmichGallerySnapshot();
  revalidatePath("/media");
  revalidatePath("/en/media");
  // Het beheer ook: de albumlijst links toont het aantal foto's en de cover.
  revalidatePath("/[locale]/admin/media", "layout");
}

/**
 * De schakelaar die het uploaden naar de fakbargalerij vrijgeeft. Staat
 * standaard uit; zie lib/fakbar-gallery.ts voor waarom.
 */
export async function setFakbarUploadEnabledAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requirePermission("media.manage");
  const enabled = formData.get("enabled") === "true";
  await setFakbarUploadEnabled(enabled);
  await logAudit({
    action: "update",
    entity: "media",
    entityId: "media.fakbarUpload",
    target: "fakbar-upload",
    summary: enabled
      ? "uploaden naar de fakbargalerij aangezet"
      : "uploaden naar de fakbargalerij uitgezet",
  });
  revalidatePath("/[locale]/admin/media", "layout");
  // De web-variant van saveOk draagt geen eigen melding; het formulier zegt
  // zelf wat de nieuwe stand is.
  return saveOk();
}
