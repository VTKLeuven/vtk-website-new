'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { sendMail } from '@vtk/mail';
import {
  TAKEDOWN_LIMITS,
  TAKEDOWN_RATE_LIMIT,
  TakedownRateLimiter,
  deleteImmichAssets,
  parseTakedownSubmission,
  takedownClientKey,
  takedownMailBody,
} from '@vtk/gallery';
import { canManageFakbar, getSession } from '@/lib/session';
import { fakbarGallery } from '@/lib/gallery';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import type { ActionResult } from '@/app/actions/fakbar';

/**
 * Verwijderverzoeken voor foto's in de galerij van 't ElixIr.
 *
 * De regels (validatie, mailtekst, snelheidslimiet) staan in `@vtk/gallery`,
 * gedeeld met de hoofdsite. Hier staat enkel het I/O-werk: schrijven, mailen en
 * afhandelen, met het adres en de rechten van deze app.
 */

/** Waar een verzoek gemeld wordt. */
const TAKEDOWN_TO = process.env.FAKBAR_TAKEDOWN_MAIL_TO?.trim() || 'fakbar@vtk.be';

/**
 * De afzender. Nooit het adres van de melder: dan zou onze mailserver een
 * domein spoofen dat hij niet mag ondertekenen en gooit SPF/DKIM het bericht in
 * de spam. De melder zit in `replyTo`.
 */
const TAKEDOWN_FROM = process.env.MAIL_FROM_TAKEDOWN?.trim() || "'t ElixIr <fakbar@vtk.be>";

function appUrl(): string {
  return (process.env.FAKBAR_APP_URL?.trim() || 'http://localhost:3300').replace(/\/+$/, '');
}

/**
 * De teller staat in het geheugen van dit proces; bij een herstart begint ze
 * opnieuw. Voor een drempel tegen scripts volstaat dat, en het scheelt een tabel
 * en een opkuistaak.
 */
const limiter = new TakedownRateLimiter(TAKEDOWN_RATE_LIMIT.max, TAKEDOWN_RATE_LIMIT.windowMs);

async function requireFakbar() {
  const session = await getSession();
  if (!session || !canManageFakbar(session)) throw new Error('FORBIDDEN');
  return session;
}

// -----------------------------------------------------------------------------
// Wat een bezoeker doet
// -----------------------------------------------------------------------------

export async function submitTakedownAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = parseTakedownSubmission({
    albumSlug: formData.get('albumSlug'),
    assetId: formData.get('assetId'),
    name: formData.get('name'),
    email: formData.get('email'),
    reason: formData.get('reason'),
    message: formData.get('message'),
    honeypot: formData.get('website'),
  });

  // De honeypot: doen alsof het gelukt is. Een bot die een foutmelding krijgt,
  // weet dat hij ontdekt is en past zijn volgende poging aan.
  if (parsed.status === 'honeypot') return saveOk();
  if (parsed.status === 'error') return saveError(parsed.code);

  if (!limiter.take(takedownClientKey(await headers()))) return saveError('RATE_LIMITED');

  const { submission } = parsed;

  // De foto opzoeken *in deze galerij*: zo kan een gemanipuleerd formulier geen
  // verzoek indienen over een album van de hoofdsite, en hebben we meteen de
  // momentopnames die na het verwijderen nog moeten kloppen.
  const album = await fakbarGallery.getAlbum(submission.albumSlug).catch(() => null);
  const photo = album?.photos.find((entry) => entry.id === submission.assetId);
  if (!album || !photo) return saveError('PHOTO_UNKNOWN');

  // Eerst opslaan, dan pas mailen: de rij is de waarheid en de mail een seintje.
  // Andersom zou een hikkende mailserver een verzoek laten verdwijnen.
  let requestId: string;
  try {
    const created = await prisma.photoTakedownRequest.create({
      data: {
        gallery: 'FAKBAR',
        albumSlug: album.slug,
        assetId: photo.id,
        albumTitle: album.title,
        photoFilename: photo.filename,
        reporterName: submission.name,
        reporterEmail: submission.email,
        reason: submission.reason,
        message: submission.message || null,
      },
      select: { id: true },
    });
    requestId = created.id;
  } catch {
    return saveError('SAVE_FAILED');
  }

  const body = takedownMailBody({
    gallery: 'fakbar',
    submission,
    albumTitle: album.title,
    photoFilename: photo.filename,
    adminUrl: `${appUrl()}/admin/verwijderverzoeken`,
    albumUrl: `${appUrl()}/fotos/${encodeURIComponent(album.slug)}`,
  });

  const delivered = await sendMail({
    to: TAKEDOWN_TO,
    from: TAKEDOWN_FROM,
    replyTo: `${submission.name} <${submission.email}>`,
    subject: body.subject,
    text: body.text,
  });

  // Mislukt de mail, dan staat het verzoek er nog steeds. Dat is geen fout voor
  // de melder; het beheer ziet aan `mailDelivered` dat er geen seintje uitging.
  if (delivered) {
    await prisma.photoTakedownRequest
      .update({ where: { id: requestId }, data: { mailDelivered: true } })
      .catch(() => null);
  }

  revalidatePath('/admin/verwijderverzoeken');
  return saveOk();
}

// -----------------------------------------------------------------------------
// Wat het beheer doet
// -----------------------------------------------------------------------------

/**
 * De foto uit de galerij halen.
 *
 * Naar de prullenmand van Immich (`force: false`), niet definitief: de foto is
 * meteen van de site weg en Immich ruimt zelf op, maar een tikfout in het
 * beheer is dan geen onherstelbaar verlies.
 */
export async function deleteTakedownPhotoAction(id: string): Promise<ActionResult> {
  const session = await requireFakbar();

  const request = await prisma.photoTakedownRequest.findUnique({ where: { id } });
  if (!request || request.gallery !== 'FAKBAR') return { ok: false, error: 'Dit verzoek bestaat niet meer.' };

  try {
    await deleteImmichAssets([request.assetId], { force: false });
  } catch (error) {
    // Is de foto al weg, dan is dat precies de gewenste eindtoestand en geen
    // fout; het verzoek mag gewoon afgesloten worden.
    const status = (error as { status?: number })?.status;
    if (status !== 404 && status !== 400) {
      return { ok: false, error: 'Immich is niet bereikbaar; de foto is niet verwijderd.' };
    }
  }

  await prisma.photoTakedownRequest.update({
    where: { id },
    data: { status: 'DELETED', handledById: session.user.id, handledAt: new Date() },
  });

  // Zonder dit blijft de foto tot een minuut in de momentopname staan en lijkt
  // het alsof er niets gebeurde.
  await fakbarGallery.refreshSnapshot().catch(() => null);

  revalidatePath('/admin/verwijderverzoeken');
  revalidatePath('/fotos');
  revalidatePath(`/fotos/${request.albumSlug}`);
  return { ok: true, message: 'De foto is uit de galerij gehaald.' };
}

/** Het verzoek afsluiten zonder de foto weg te halen, met een verplichte reden. */
export async function keepTakedownPhotoAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireFakbar();

  const id = typeof formData.get('id') === 'string' ? String(formData.get('id')) : '';
  const note = String(formData.get('note') ?? '')
    .trim()
    .slice(0, TAKEDOWN_LIMITS.note);
  if (!id) return saveError('REQUEST_MISSING');
  // Zonder reden is "bewaren" achteraf niet te verantwoorden tegenover de melder.
  if (note === '') return saveError('NOTE_REQUIRED');

  const request = await prisma.photoTakedownRequest.findUnique({ where: { id }, select: { gallery: true } });
  if (!request || request.gallery !== 'FAKBAR') return saveError('REQUEST_MISSING');

  await prisma.photoTakedownRequest.update({
    where: { id },
    data: { status: 'KEPT', handlingNote: note, handledById: session.user.id, handledAt: new Date() },
  });

  revalidatePath('/admin/verwijderverzoeken');
  return saveOk('Het verzoek is afgesloten.');
}

/** Een afgehandeld verzoek terug openzetten, bijvoorbeeld na overleg. */
export async function reopenTakedownAction(id: string): Promise<ActionResult> {
  await requireFakbar();

  const request = await prisma.photoTakedownRequest.findUnique({ where: { id }, select: { gallery: true } });
  if (!request || request.gallery !== 'FAKBAR') return { ok: false, error: 'Dit verzoek bestaat niet meer.' };

  await prisma.photoTakedownRequest.update({
    where: { id },
    data: { status: 'NEW', handlingNote: null, handledById: null, handledAt: null },
  });

  revalidatePath('/admin/verwijderverzoeken');
  return { ok: true, message: 'Het verzoek staat weer open.' };
}
