"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { sendMail } from "@/lib/email";
import {
  TAKEDOWN_LIMITS,
  TAKEDOWN_RATE_LIMIT,
  TakedownRateLimiter,
  deleteImmichAssets,
  parseTakedownSubmission,
  takedownClientKey,
  takedownMailBody,
} from "@vtk/gallery";
import { getImmichGalleryAlbum, refreshImmichGallerySnapshot } from "@/lib/immich-gallery";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * Verwijderverzoeken voor foto's in de galerij van vtk.be.
 *
 * De regels (validatie, mailtekst, snelheidslimiet) staan in `@vtk/gallery`,
 * gedeeld met de fak-app. Hier staat enkel het I/O-werk: schrijven, mailen en
 * afhandelen, met het adres en de rechten van deze site.
 */

/** Waar een verzoek gemeld wordt. */
const TAKEDOWN_TO = process.env.TAKEDOWN_MAIL_TO?.trim() || "communicatie@vtk.be";

/**
 * De afzender. Nooit het adres van de melder: dan zou onze mailserver een
 * domein spoofen dat hij niet mag ondertekenen en gooit SPF/DKIM het bericht in
 * de spam. De melder zit in `replyTo`.
 */
const TAKEDOWN_FROM = process.env.MAIL_FROM_TAKEDOWN?.trim() || "VTK website <info@vtk.be>";

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  return (configured || "https://vtk.be").replace(/\/+$/, "");
}

/**
 * De teller staat in het geheugen van dit proces; bij een herstart begint ze
 * opnieuw. Voor een drempel tegen scripts volstaat dat, en het scheelt een tabel
 * en een opkuistaak.
 */
const limiter = new TakedownRateLimiter(TAKEDOWN_RATE_LIMIT.max, TAKEDOWN_RATE_LIMIT.windowMs);

// -----------------------------------------------------------------------------
// Wat een bezoeker doet
// -----------------------------------------------------------------------------

export async function submitTakedownAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = parseTakedownSubmission({
    albumSlug: formData.get("albumSlug"),
    assetId: formData.get("assetId"),
    name: formData.get("name"),
    email: formData.get("email"),
    reason: formData.get("reason"),
    message: formData.get("message"),
    honeypot: formData.get("website"),
  });

  // De honeypot: doen alsof het gelukt is. Een bot die een foutmelding krijgt,
  // weet dat hij ontdekt is en past zijn volgende poging aan.
  if (parsed.status === "honeypot") return saveOk();
  if (parsed.status === "error") return saveError(parsed.code);

  if (!limiter.take(takedownClientKey(await headers()))) return saveError("RATE_LIMITED");

  const { submission } = parsed;

  // De foto opzoeken *in deze galerij*: zo kan een gemanipuleerd formulier geen
  // verzoek indienen over een fakbaralbum, en hebben we meteen de momentopnames
  // die na het verwijderen nog moeten kloppen.
  const album = await getImmichGalleryAlbum(submission.albumSlug).catch(() => null);
  const photo = album?.photos.find((entry) => entry.id === submission.assetId);
  if (!album || !photo) return saveError("PHOTO_UNKNOWN");

  // Eerst opslaan, dan pas mailen: de rij is de waarheid en de mail een seintje.
  // Andersom zou een hikkende mailserver een verzoek laten verdwijnen.
  let requestId: string;
  try {
    const created = await prisma.photoTakedownRequest.create({
      data: {
        gallery: "MAIN",
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
  } catch (error) {
    Sentry.captureException(error);
    return saveError("SAVE_FAILED");
  }

  const body = takedownMailBody({
    gallery: "main",
    submission,
    albumTitle: album.title,
    photoFilename: photo.filename,
    adminUrl: `${siteUrl()}/nl/admin/media/verwijderverzoeken`,
    albumUrl: `${siteUrl()}/nl/media/${encodeURIComponent(album.slug)}`,
  });

  const delivered = await sendMail(
    {
      to: TAKEDOWN_TO,
      from: TAKEDOWN_FROM,
      replyTo: `${submission.name} <${submission.email}>`,
      subject: body.subject,
      text: body.text,
    },
    { source: "takedowns" },
  );

  // Mislukt de mail, dan staat het verzoek er nog steeds. Dat is geen fout voor
  // de melder; het beheer ziet aan `mailDelivered` dat er geen seintje uitging.
  if (delivered) {
    await prisma.photoTakedownRequest
      .update({ where: { id: requestId }, data: { mailDelivered: true } })
      .catch(() => null);
  } else {
    // Enkel dat het misging, nooit wat er in het verzoek stond: dat zijn de
    // gegevens van een melder en die horen niet in onze monitoring.
    Sentry.captureMessage("Verwijderverzoek: meldingsmail versturen mislukt", "warning");
  }

  revalidatePath("/[locale]/admin/media/verwijderverzoeken", "page");
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
export async function deleteTakedownPhotoAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("media.manage");

  const id = String(formData.get("id") ?? "");
  const request = await prisma.photoTakedownRequest.findUnique({ where: { id } });
  if (!request || request.gallery !== "MAIN") return saveError("REQUEST_MISSING");

  try {
    await deleteImmichAssets([request.assetId], { force: false });
  } catch (error) {
    // Is de foto al weg, dan is dat precies de gewenste eindtoestand en geen
    // fout; het verzoek mag gewoon afgesloten worden.
    const status = (error as { status?: number })?.status;
    if (status !== 404 && status !== 400) return saveError("IMMICH_UNREACHABLE");
  }

  await prisma.photoTakedownRequest.update({
    where: { id },
    data: { status: "DELETED", handledById: session.user.id, handledAt: new Date() },
  });

  // Zonder dit blijft de foto tot een minuut in de momentopname staan en lijkt
  // het alsof er niets gebeurde.
  await refreshImmichGallerySnapshot().catch(() => null);

  revalidatePath("/[locale]/admin/media/verwijderverzoeken", "page");
  revalidatePath("/[locale]/media/[albumSlug]", "page");
  return saveOk();
}

/** Het verzoek afsluiten zonder de foto weg te halen, met een verplichte reden. */
export async function keepTakedownPhotoAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("media.manage");

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, TAKEDOWN_LIMITS.note);
  if (!id) return saveError("REQUEST_MISSING");
  // Zonder reden is "bewaren" achteraf niet te verantwoorden tegenover de melder.
  if (note === "") return saveError("NOTE_REQUIRED");

  const request = await prisma.photoTakedownRequest.findUnique({
    where: { id },
    select: { gallery: true },
  });
  if (!request || request.gallery !== "MAIN") return saveError("REQUEST_MISSING");

  await prisma.photoTakedownRequest.update({
    where: { id },
    data: {
      status: "KEPT",
      handlingNote: note,
      handledById: session.user.id,
      handledAt: new Date(),
    },
  });

  revalidatePath("/[locale]/admin/media/verwijderverzoeken", "page");
  return saveOk();
}

/** Een afgehandeld verzoek terug openzetten, bijvoorbeeld na overleg. */
export async function reopenTakedownAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("media.manage");

  const id = String(formData.get("id") ?? "");
  const request = await prisma.photoTakedownRequest.findUnique({
    where: { id },
    select: { gallery: true },
  });
  if (!request || request.gallery !== "MAIN") return saveError("REQUEST_MISSING");

  await prisma.photoTakedownRequest.update({
    where: { id },
    data: { status: "NEW", handlingNote: null, handledById: null, handledAt: null },
  });

  revalidatePath("/[locale]/admin/media/verwijderverzoeken", "page");
  return saveOk();
}
