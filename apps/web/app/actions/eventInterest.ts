"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { getCurrentSession } from "@/lib/session";
import { eventIsVisible } from "@/lib/app-api/interest";
import {
  ensureGuestDeviceHash,
  eventIsForAlumni,
  readGuestDeviceHash,
} from "@/lib/calendar/interest";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * "Ik kom naar dit evenement", vanaf de website.
 *
 * Schrijft in dezelfde tabel als de ster in de app, zodat een lid dat in de app
 * tikt en op de site kijkt niet twee verschillende antwoorden krijgt.
 */

export type InterestErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "LOGIN_REQUIRED"
  | "NOTHING_TO_SHOW";

const displaySchema = z.object({
  eventId: z.string().min(1),
  showName: z.boolean().default(false),
  showGraduationYear: z.boolean().default(false),
  showWasInVtk: z.boolean().default(false),
});

/**
 * Zet interesse aan (met de zichtbaarheidskeuzes) of uit. `interested` staat in
 * de FormData zodat dezelfde action beide kanten dekt; twee keer aanduiden hoort
 * niets te doen, niet te falen.
 */
export async function setEventInterestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED" satisfies InterestErrorCode);

  const parsed = displaySchema.safeParse({
    eventId: formData.get("eventId") ?? "",
    showName: formData.get("showName") === "on",
    showGraduationYear: formData.get("showGraduationYear") === "on",
    showWasInVtk: formData.get("showWasInVtk") === "on",
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies InterestErrorCode);

  const { eventId, ...display } = parsed.data;
  const interested = formData.get("interested") !== "off";

  if (!interested) {
    await prisma.calendarEventInterest.deleteMany({
      where: { userId: session.user.id, eventId },
    });
    revalidatePath(`/kalender/${eventId}`);
    return saveOk();
  }

  // Zonder deze controle is de knop een manier om te achterhalen welke event-id's
  // bestaan, ook die van een concept of van een doelgroep waar je niet bij hoort.
  if (!(await eventIsVisible(eventId))) {
    return saveError("NOT_FOUND" satisfies InterestErrorCode);
  }

  await prisma.calendarEventInterest.upsert({
    where: { userId_eventId: { userId: session.user.id, eventId } },
    update: display,
    create: { userId: session.user.id, eventId, ...display },
  });

  revalidatePath(`/kalender/${eventId}`);
  return saveOk();
}

const guestSchema = z.object({
  eventId: z.string().min(1),
  displayName: z.string().trim().max(80).default(""),
  graduationYear: z
    .string()
    .trim()
    .refine((v) => {
      if (v === "") return true;
      if (!/^\d{4}$/.test(v)) return false;
      const year = Number(v);
      return year >= 1920 && year <= new Date().getFullYear() + 1;
    })
    .default(""),
  wasInVtk: z.boolean().default(false),
});

/**
 * Hetzelfde, maar door iemand zonder account. Enkel bij een alumni-evenement, en
 * enkel wanneer er iets in te vullen valt: een lege rij zou de teller verhogen
 * zonder dat iemand weet wie er komt, en dan is het niet meer dan een klikknop.
 */
export async function setGuestInterestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = guestSchema.safeParse({
    eventId: formData.get("eventId") ?? "",
    displayName: formData.get("displayName") ?? "",
    graduationYear: formData.get("graduationYear") ?? "",
    wasInVtk: formData.get("wasInVtk") === "on",
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies InterestErrorCode);

  const { eventId, displayName, graduationYear, wasInVtk } = parsed.data;

  if (!(await eventIsVisible(eventId)) || !(await eventIsForAlumni(eventId))) {
    return saveError("NOT_FOUND" satisfies InterestErrorCode);
  }
  if (!displayName && !graduationYear && !wasInVtk) {
    return saveError("NOTHING_TO_SHOW" satisfies InterestErrorCode);
  }

  const deviceHash = await ensureGuestDeviceHash();
  const data = {
    displayName: displayName || null,
    graduationYear: graduationYear ? Number(graduationYear) : null,
    wasInVtk,
  };
  await prisma.calendarEventGuestInterest.upsert({
    where: { eventId_deviceHash: { eventId, deviceHash } },
    update: data,
    create: { eventId, deviceHash, ...data },
  });

  revalidatePath(`/kalender/${eventId}`);
  return saveOk();
}

/** Een gast neemt zijn aanmelding terug. Zonder cookie valt er niets terug te nemen. */
export async function removeGuestInterestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return saveError("INVALID_INPUT" satisfies InterestErrorCode);

  const deviceHash = await readGuestDeviceHash();
  if (deviceHash) {
    await prisma.calendarEventGuestInterest.deleteMany({ where: { eventId, deviceHash } });
  }
  revalidatePath(`/kalender/${eventId}`);
  return saveOk();
}
