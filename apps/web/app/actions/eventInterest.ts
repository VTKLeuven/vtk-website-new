"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { getCurrentSession } from "@/lib/session";
import { eventIsVisible } from "@/lib/app-api/interest";
import {
  ensureGuestDeviceHash,
  eventIsForAlumni,
  eventMomentStarts,
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
  "INVALID_INPUT" | "NOT_FOUND" | "LOGIN_REQUIRED" | "MISSING_VISIBLE_VALUE";

const yearField = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    if (!/^\d{4}$/.test(v)) return false;
    const year = Number(v);
    return year >= 1920 && year <= new Date().getFullYear() + 1;
  })
  .default("");

const attendanceSchema = z.object({
  eventId: z.string().min(1),
  /**
   * Het moment waarvoor dit geldt, als ISO-instant, bij een evenement met losse
   * momenten. Leeg = het evenement als geheel: dat is elk gewoon evenement, en
   * op een kaart die de hele reeks toont ook een evenement met momenten (dan
   * gaan alle momenten tegelijk aan of uit).
   */
  momentStart: z.string().trim().default(""),
  displayName: z.string().trim().max(80).default(""),
  graduationYear: yearField,
  wasInVtk: z.boolean().default(false),
  showName: z.boolean().default(false),
  showGraduationYear: z.boolean().default(false),
  showWasInVtk: z.boolean().default(false),
});

type AttendanceInput = z.infer<typeof attendanceSchema>;

function attendanceData(input: AttendanceInput) {
  return {
    displayName: input.displayName || null,
    graduationYear: input.graduationYear ? Number(input.graduationYear) : null,
    wasInVtk: input.wasInVtk,
    showName: input.showName,
    showGraduationYear: input.showGraduationYear,
    showWasInVtk: input.showWasInVtk,
  };
}

function missesVisibleValue(input: AttendanceInput): boolean {
  return (
    (input.showName && !input.displayName) || (input.showGraduationYear && !input.graduationYear)
  );
}

function parseAttendance(formData: FormData) {
  return attendanceSchema.safeParse({
    eventId: formData.get("eventId") ?? "",
    momentStart: formData.get("momentStart") ?? "",
    displayName: formData.get("displayName") ?? "",
    graduationYear: formData.get("graduationYear") ?? "",
    wasInVtk: formData.get("wasInVtk") === "on",
    showName: formData.get("showName") === "on",
    showGraduationYear: formData.get("showGraduationYear") === "on",
    showWasInVtk: formData.get("showWasInVtk") === "on",
  });
}

/**
 * Zet interesse aan (met de zichtbaarheidskeuzes) of uit. `interested` staat in
 * de FormData zodat dezelfde action beide kanten dekt; twee keer aanduiden hoort
 * niets te doen, niet te falen.
 */
/**
 * De eventpagina verversen na een wijziging aan de aanwezigheidslijst.
 *
 * Het routepatroon en niet `/kalender/<id>`: de publieke URL is sinds de
 * URL-namen de slug, dus een pad met de id erin ververst een adres waar niemand
 * staat. De teller en de lijst zouden dan pas bijwerken als de cache vanzelf
 * verloopt.
 */
function revalidateEventPage() {
  revalidatePath("/kalender/[slugOrId]", "page");
}

export async function setEventInterestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED" satisfies InterestErrorCode);

  const parsed = parseAttendance(formData);
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies InterestErrorCode);

  const { eventId, momentStart } = parsed.data;
  const interested = formData.get("interested") !== "off";
  const userId = session.user.id;

  // Een moment meegeven betekent: enkel die dag van de reeks. Zonder moment gaat
  // het over het evenement als geheel, en bij een reeks dus over al haar dagen
  // tegelijk (de ster op een kaart die de hele reeks toont).
  const when = momentStart ? new Date(momentStart) : null;
  if (when && Number.isNaN(when.getTime())) {
    return saveError("INVALID_INPUT" satisfies InterestErrorCode);
  }

  if (!interested) {
    await prisma.calendarEventInterest.deleteMany({
      where: { userId, eventId, ...(when ? { momentStart: when } : {}) },
    });
    revalidateEventPage();
    return saveOk();
  }

  // Zonder deze controle is de knop een manier om te achterhalen welke event-id's
  // bestaan, ook die van een concept of van een doelgroep waar je niet bij hoort.
  if (!(await eventIsVisible(eventId))) {
    return saveError("NOT_FOUND" satisfies InterestErrorCode);
  }

  const isAlumniEvent = await eventIsForAlumni(eventId);
  if (isAlumniEvent && missesVisibleValue(parsed.data)) {
    return saveError("MISSING_VISIBLE_VALUE" satisfies InterestErrorCode);
  }

  const data = isAlumniEvent
    ? attendanceData(parsed.data)
    : {
        displayName: null,
        graduationYear: null,
        wasInVtk: false,
        showName: false,
        showGraduationYear: false,
        showWasInVtk: false,
      };

  const starts = await eventMomentStarts(eventId);
  if (when) {
    // Een willekeurig instant mag hier niet binnenkomen: enkel een moment dat dit
    // evenement echt heeft. Anders staat er een markering voor een dag die niet
    // bestaat, en die haalt niemand er ooit nog af.
    if (!starts.some((start) => start.getTime() === when.getTime())) {
      return saveError("NOT_FOUND" satisfies InterestErrorCode);
    }
    await writeInterest(userId, eventId, when, data);
  } else if (starts.length > 0) {
    for (const start of starts) await writeInterest(userId, eventId, start, data);
  } else {
    await writeInterest(userId, eventId, null, data);
  }

  revalidateEventPage();
  return saveOk();
}

/**
 * Eén markering schrijven, voor het evenement (`momentStart` null) of voor één
 * moment ervan.
 *
 * Zonder moment kan het geen `upsert` zijn: de unieke sleutel bevat
 * `momentStart`, en Postgres ziet twee NULL's als verschillend, dus een upsert
 * zou daar nooit de bestaande rij vinden. Twee keer aanduiden hoort niets te
 * doen en niet te falen, vandaar eerst lezen.
 */
async function writeInterest(
  userId: string,
  eventId: string,
  momentStart: Date | null,
  data: ReturnType<typeof attendanceData>,
): Promise<void> {
  if (momentStart) {
    await prisma.calendarEventInterest.upsert({
      where: { userId_eventId_momentStart: { userId, eventId, momentStart } },
      update: data,
      create: { userId, eventId, momentStart, ...data },
    });
    return;
  }

  const existing = await prisma.calendarEventInterest.findFirst({
    where: { userId, eventId, momentStart: null },
    select: { id: true },
  });
  if (existing) {
    await prisma.calendarEventInterest.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.calendarEventInterest.create({ data: { userId, eventId, ...data } });
}

/**
 * Hetzelfde, maar door iemand zonder account. Enkel bij een alumni-evenement.
 * De extra informatie blijft optioneel: ook een volledig anonieme interesse is
 * geldig en verhoogt alleen de teller.
 */
export async function setGuestInterestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = parseAttendance(formData);
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies InterestErrorCode);

  const { eventId } = parsed.data;

  if (!(await eventIsVisible(eventId)) || !(await eventIsForAlumni(eventId))) {
    return saveError("NOT_FOUND" satisfies InterestErrorCode);
  }
  if (missesVisibleValue(parsed.data)) {
    return saveError("MISSING_VISIBLE_VALUE" satisfies InterestErrorCode);
  }

  const deviceHash = await ensureGuestDeviceHash();
  const data = attendanceData(parsed.data);
  await prisma.calendarEventGuestInterest.upsert({
    where: { eventId_deviceHash: { eventId, deviceHash } },
    update: data,
    create: { eventId, deviceHash, ...data },
  });

  revalidateEventPage();
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
  revalidateEventPage();
  return saveOk();
}
