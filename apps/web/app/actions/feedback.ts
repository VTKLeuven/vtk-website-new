"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { logAudit } from "@/lib/audit";
import {
  FEEDBACK_LIMITS,
  isFeedbackKind,
  isFeedbackStatus,
  normaliseFeedbackPath,
} from "@/lib/feedback";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requirePermission, requireSession } from "@/lib/session";

/**
 * Websitefeedback: een lid meldt iets over de site zelf.
 *
 * Het formulier hangt in het accountmenu, dus er is altijd een sessie. Toch
 * wordt er bij een anonieme melding niets over die sessie weggeschreven: het
 * vinkje moet betekenen wat het zegt. Zie `docs/design-decisions.md`.
 */

const ADMIN_PATH = "/[locale]/admin/it/feedback";

// -----------------------------------------------------------------------------
// Wat een lid doet
// -----------------------------------------------------------------------------

export async function submitFeedbackAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();

  const kind = formData.get("kind");
  if (!isFeedbackKind(kind)) return saveError("KIND_INVALID");

  const message = String(formData.get("message") ?? "").trim();
  if (message === "") return saveError("MESSAGE_REQUIRED");
  if (message.length > FEEDBACK_LIMITS.message) return saveError("MESSAGE_TOO_LONG");

  // De screenshot is al geüpload; hier komt enkel de key binnen. Een key van
  // buiten `feedback/` is geknoei met het verborgen veld.
  const imageKeyRaw = String(formData.get("imageKey") ?? "").trim();
  if (imageKeyRaw && !imageKeyRaw.startsWith("feedback/")) return saveError("IMAGE_INVALID");

  const anonymous = formData.get("anonymous") === "1";
  const path = normaliseFeedbackPath(formData.get("path"));
  const userAgent = (await headers()).get("user-agent")?.slice(0, FEEDBACK_LIMITS.userAgent) ?? null;

  try {
    await prisma.websiteFeedback.create({
      data: {
        kind,
        message,
        imageKey: imageKeyRaw || null,
        path,
        userAgent,
        anonymous,
        // Bewust geen `authorId` bij een anonieme melding: een kolom die stil
        // toch ingevuld blijft, maakt van het vinkje een leugen.
        authorId: anonymous ? null : session.user.id,
      },
      select: { id: true },
    });
  } catch (error) {
    Sentry.captureException(error);
    return saveError("SAVE_FAILED");
  }

  // Geen mail en geen pushbericht: dit is een werklijst die IT zelf naleest,
  // geen melding die iemand midden in de nacht wakker hoort te maken.
  revalidatePath(ADMIN_PATH, "page");
  return saveOk();
}

// -----------------------------------------------------------------------------
// Wat het beheer doet
// -----------------------------------------------------------------------------

/**
 * De status van een melding zetten, met een notitie.
 *
 * Eén action voor de vier statussen in plaats van vier knoppen: de triage is
 * een keuze uit een lijst, niet vier losse beslissingen. Afwijzen vraagt wél
 * een notitie; "niets mee gedaan" zonder reden is over een half jaar niet meer
 * te verantwoorden.
 */
export async function updateFeedbackAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("feedback.manage");

  const id = String(formData.get("id") ?? "");
  const status = formData.get("status");
  if (!isFeedbackStatus(status)) return saveError("STATUS_INVALID");

  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, FEEDBACK_LIMITS.note);
  if (status === "DISMISSED" && note === "") return saveError("NOTE_REQUIRED");

  const existing = await prisma.websiteFeedback.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true },
  });
  if (!existing) return saveError("FEEDBACK_MISSING");

  // Terug naar "Nieuw" zetten is een melding heropenen: dan hoort er ook geen
  // behandelaar meer op te staan, anders leest de lijst alsof iemand er al iets
  // mee deed.
  const handled = status !== "NEW";

  await prisma.websiteFeedback.update({
    where: { id },
    data: {
      status,
      handlingNote: note || null,
      handledById: handled ? session.user.id : null,
      handledAt: handled ? new Date() : null,
    },
  });

  await logAudit({
    action: "update",
    entity: "websiteFeedback",
    entityId: id,
    target: `Feedback (${existing.kind})`,
    summary: `status ${existing.status} → ${status}`,
  });

  revalidatePath(ADMIN_PATH, "page");
  return saveOk();
}

/**
 * Een melding definitief weggooien. Voor spam en dubbels; de gewone weg is
 * afsluiten met een status, zodat de historiek leesbaar blijft.
 *
 * Geeft `void` terug omdat `DeleteIconButton` de bevestiging en de toast al
 * doet (zie CLAUDE.md > UX-conventies).
 */
export async function deleteFeedbackAction(formData: FormData): Promise<void> {
  await requirePermission("feedback.manage");

  const id = String(formData.get("id") ?? "");
  const existing = await prisma.websiteFeedback.findUnique({
    where: { id },
    select: { id: true, kind: true, imageKey: true },
  });
  if (!existing) return;

  // Eerst de rij, dan het bestand: een wees in de objectopslag is minder erg
  // dan een rij die naar een screenshot wijst die er niet meer is.
  await prisma.websiteFeedback.delete({ where: { id } });
  if (existing.imageKey) {
    await deleteObject(existing.imageKey).catch((error) => {
      console.error("[feedback] screenshot verwijderen mislukt", error);
    });
  }

  await logAudit({
    action: "delete",
    entity: "websiteFeedback",
    entityId: id,
    target: `Feedback (${existing.kind})`,
  });

  revalidatePath(ADMIN_PATH, "page");
}
