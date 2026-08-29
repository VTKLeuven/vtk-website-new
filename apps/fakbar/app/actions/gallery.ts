'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { setImmichAlbumCover, uploadImmichAsset } from '@vtk/gallery';
import { canManageFakbar, getSession } from '@/lib/session';
import { fakbarGallery } from '@/lib/gallery';

/**
 * Uploaden naar de fotogalerij van 't ElixIr.
 *
 * Dezelfde flow als /admin/media op de hoofdsite: eerst het album aanmaken, dan
 * de foto's er één voor één in, dan de cover, dan de momentopname verversen.
 * Eén bestand per aanroep, want een server action heeft een bodylimiet en een
 * avond fotograferen levert makkelijk tweehonderd bestanden op; zo kan de
 * client bovendien de voortgang tonen en per bestand een fout opvangen.
 *
 * **Het album belandt altijd in de fakbargalerij.** De merker komt uit
 * `fakbarGallery` en niet uit het formulier, dus deze acties kunnen per
 * constructie niet naar de galerij van vtk.be schrijven.
 */

/** Immich zelf slikt meer, maar dit is de grens waar een server action op stukloopt. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const DEVICE_ID = 'vtk-fakbar-admin';

async function requireFakbar(): Promise<void> {
  const session = await getSession();
  if (!session || !canManageFakbar(session)) throw new Error('FORBIDDEN');
}

function readField(formData: FormData, name: string, maxLength = 200): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function createAlbumAction(
  formData: FormData,
): Promise<{ ok: boolean; albumId?: string; error?: string }> {
  await requireFakbar();
  const title = readField(formData, 'title');
  const description = readField(formData, 'description', 1000);
  if (!title) return { ok: false, error: 'missing_title' };

  try {
    const album = await fakbarGallery.createAlbum({ title, description });
    return { ok: true, albumId: album.id };
  } catch (error) {
    console.error('Immich album creation failed (fakbar)', error);
    return { ok: false, error: 'immich_unreachable' };
  }
}

export async function uploadAssetAction(
  formData: FormData,
): Promise<{ ok: boolean; assetId?: string; error?: string }> {
  await requireFakbar();
  const albumId = readField(formData, 'albumId', 100);
  const file = formData.get('file');

  if (!albumId || !(file instanceof File) || file.size === 0) return { ok: false, error: 'missing' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' };
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    return { ok: false, error: 'unsupported_type' };
  }

  try {
    const uploaded = await uploadImmichAsset({
      assetData: file,
      filename: file.name || 'foto.jpg',
      mimeType: file.type || 'image/jpeg',
      // Een eigen deviceAssetId per upload: Immich ontdubbelt op dat veld, en
      // twee foto's uit dezelfde reeks hebben vaak dezelfde bestandsnaam.
      deviceAssetId: `${DEVICE_ID}-${randomUUID()}`,
      deviceId: DEVICE_ID,
      createdAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    });
    if (!uploaded?.id) return { ok: false, error: 'upload_failed' };

    await fakbarGallery.addAssets(albumId, [uploaded.id]);
    return { ok: true, assetId: uploaded.id };
  } catch (error) {
    console.error('Immich asset upload failed (fakbar)', error);
    return { ok: false, error: 'upload_failed' };
  }
}

export async function setAlbumCoverAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireFakbar();
  const albumId = readField(formData, 'albumId', 100);
  const assetId = readField(formData, 'assetId', 100);
  if (!albumId || !assetId) return { ok: false, error: 'missing' };

  try {
    await setImmichAlbumCover(albumId, assetId);
    return { ok: true };
  } catch (error) {
    console.error('Immich album cover update failed (fakbar)', error);
    return { ok: false, error: 'cover_failed' };
  }
}

/** Ververst de momentopname zodat het nieuwe album meteen op /fotos staat. */
export async function finalizeAlbumAction(): Promise<void> {
  await requireFakbar();
  await fakbarGallery.refreshSnapshot();
  revalidatePath('/fotos');
  revalidatePath('/admin/fotos');
}
