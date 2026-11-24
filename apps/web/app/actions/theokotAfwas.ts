"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import type { SessionPayload } from "@vtk/auth";
import { requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { parseYMD, type YMD } from "@/lib/brussels";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  afwasBlock,
  bookedSpan,
  dateToDay,
  dayToDate,
  describeAfwas,
  hourPast,
  hoursLabel,
  isAfwasKind,
  normalizeHours,
  reminderWindowPassed,
  theokotDayState,
  type AfwasKind,
  type AfwasSlot,
} from "@/lib/theokotAfwas";
import {
  afwasDayLabel,
  canManageAfwas,
  loadAfwasSlot,
  loadWeekSessions,
  ownAfwasGroupIds,
} from "@/lib/theokotAfwas-server";

/**
 * De afwas in Theokot: noteren wat er af te wassen valt, een namiddag boeken,
 * afvinken en annuleren. Elk lid doet dat voor zijn eigen post, werkgroep of
 * jaarwerking; Theokot en Logistiek (`canManageAfwas`) voor elke groep. Zie
 * docs/design-decisions.md, "Theokot: afwasbeurten".
 */

const NOTE_MAX = 200;
const QUANTITY_MAX = 120;

function revalidateAfwas() {
  revalidatePath("/[locale]/admin/theokot/afwas", "page");
}

function mayHandle(session: SessionPayload, groupId: string): boolean {
  return canManageAfwas(session) || ownAfwasGroupIds(session).includes(groupId);
}

/**
 * Kunnen deze uren van deze dag geboekt worden? Een foutcode, of null. Of een
 * uur al bezet is, zegt de unieke (dag, uur) bij het opslaan.
 */
async function checkHours(day: YMD, hours: number[], slot: AfwasSlot, now: Date): Promise<string | null> {
  if (hours.length === 0) return "HOURS_REQUIRED";
  const weeks = await loadWeekSessions(day, day);
  const block = afwasBlock({ day, state: theokotDayState(day, weeks), slot, now });
  if (block === "weekend") return "WEEKEND";
  if (block === "past") return "PAST";
  if (block === "closed") return "CLOSED";
  if (block === "tooFar") return "TOO_FAR";
  if (hours.some((hour) => hourPast(day, slot, hour, now))) return "PAST";
  return null;
}

function isTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function readHours(formData: FormData): number[] {
  return normalizeHours(formData.getAll("hours").map((value) => Number(value)));
}

/** Het begin van het eerste geboekte uur, of null zonder namiddag. */
function bookedStart(day: Date | null, hours: { hour: number }[], slot: AfwasSlot): Date | null {
  if (!day || hours.length === 0) return null;
  return bookedSpan(dateToDay(day), slot, hours.map((row) => row.hour)).start;
}

/**
 * Drie vormen, één formulier:
 * - een nieuwe afwas mét uren (een vrij uur aangeklikt);
 * - een nieuwe afwas zonder namiddag (wat er vuil is, het tijdslot volgt later);
 * - uren kiezen of wijzigen voor een afwas die er al stond (`entryId`).
 */
export async function saveAfwasAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const now = new Date();

  const dayRaw = String(formData.get("day") ?? "").trim();
  const day = dayRaw === "" ? null : parseYMD(dayRaw);
  if (dayRaw !== "" && !day) return saveError("INVALID_DAY");
  const hours = day ? readHours(formData) : [];

  const entryId = String(formData.get("entryId") ?? "").trim();
  if (entryId !== "") {
    if (!day) return saveError("INVALID_DAY");
    return pickAfwasHours(session, entryId, day, hours, now);
  }

  const groupId = String(formData.get("groupId") ?? "");
  if (!mayHandle(session, groupId)) return saveError("NOT_YOUR_GROUP");
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, nameNl: true, active: true } });
  // Een stopgezette groep voegt enkel nog toe wie er zelf in zit.
  if (!group || (!group.active && !ownAfwasGroupIds(session).includes(groupId))) return saveError("UNKNOWN_GROUP");

  const kinds = [...new Set(formData.getAll("kinds").map(String))].filter(isAfwasKind) as AfwasKind[];
  if (kinds.length === 0) return saveError("KINDS_REQUIRED");
  const quantity = String(formData.get("quantity") ?? "").trim();
  if (quantity === "") return saveError("QUANTITY_REQUIRED");
  if (quantity.length > QUANTITY_MAX) return saveError("QUANTITY_TOO_LONG");

  const eventRaw = String(formData.get("eventDate") ?? "").trim();
  const eventDay = eventRaw === "" ? null : parseYMD(eventRaw);
  if (eventRaw !== "" && !eventDay) return saveError("INVALID_EVENT_DATE");
  // Met een namiddag erbij is de datum wat de waarschuwing "niet de week erna"
  // mogelijk maakt. Zonder namiddag (een overgetikte regel) mag ze ontbreken.
  if (day && !eventDay) return saveError("EVENT_DATE_REQUIRED");

  const noteRaw = String(formData.get("note") ?? "").trim();
  if (noteRaw.length > NOTE_MAX) return saveError("NOTE_TOO_LONG");
  const note = noteRaw === "" ? null : noteRaw;

  const slot = await loadAfwasSlot();
  let reminderSentAt: Date | null = null;
  if (day) {
    const blocked = await checkHours(day, hours, slot, now);
    if (blocked) return saveError(blocked);
    // Morgen of vandaag geboekt: wie net boekte, weet het al.
    if (reminderWindowPassed(bookedSpan(day, slot, hours).start, now)) reminderSentAt = now;
  }

  let created: { id: string };
  try {
    created = await prisma.theokotDishwash.create({
      data: {
        day: day ? dayToDate(day) : null,
        hours: day ? { create: hours.map((hour) => ({ day: dayToDate(day), hour })) } : undefined,
        groupId: group.id,
        kinds,
        quantity,
        eventDate: eventDay ? dayToDate(eventDay) : null,
        note,
        createdById: session.user.id,
        reminderSentAt,
        // Zette de groep het zelf, dan valt er niets te melden. Noteert Theokot
        // of Logistiek het voor een andere groep, dan krijgt die een mail.
        noticeSentAt: ownAfwasGroupIds(session).includes(group.id) ? now : null,
      },
      select: { id: true },
    });
  } catch (error) {
    // Een andere groep was net sneller: een uur is uniek per dag.
    if (isTaken(error)) {
      revalidateAfwas();
      return saveError("TAKEN");
    }
    throw error;
  }

  await logAudit({
    action: "create",
    entity: "theokotDishwash",
    entityId: created.id,
    target: `Afwas ${group.nameNl}`,
    summary: `${describeAfwas(quantity, kinds, true)}; ${
      day ? `${afwasDayLabel(day, true)} ${hoursLabel(slot, hours)}` : "nog geen namiddag"
    }${note ? ` (${note})` : ""}`,
  });
  revalidateAfwas();
  return saveOk();
}

/**
 * Uren kiezen voor een afwas zonder, of ze verzetten (een andere dag of andere
 * uren). De regel blijft dezelfde (wat, hoeveel, evenement); enkel de uren
 * veranderen, in één transactie, zodat een bezet uur niets half achterlaat. Een
 * groep verzet tot het begin van haar eerste uur, Theokot en Logistiek altijd.
 */
async function pickAfwasHours(
  session: SessionPayload,
  entryId: string,
  day: YMD,
  hours: number[],
  now: Date,
): Promise<SaveState> {
  const entry = await prisma.theokotDishwash.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      day: true,
      groupId: true,
      washedAt: true,
      quantity: true,
      kinds: true,
      hours: { select: { hour: true } },
      group: { select: { nameNl: true } },
    },
  });
  if (!entry) return saveError("NOT_FOUND");
  if (!mayHandle(session, entry.groupId)) return saveError("NOT_YOUR_GROUP");
  if (entry.washedAt) return saveError("WASHED");
  const slot = await loadAfwasSlot();
  const currentStart = bookedStart(entry.day, entry.hours, slot);
  if (!canManageAfwas(session) && currentStart && now.getTime() >= currentStart.getTime()) return saveError("PAST");
  const blocked = await checkHours(day, hours, slot, now);
  if (blocked) return saveError(blocked);

  try {
    await prisma.$transaction([
      prisma.theokotDishwashHour.deleteMany({ where: { dishwashId: entry.id } }),
      prisma.theokotDishwash.update({
        where: { id: entry.id },
        data: {
          day: dayToDate(day),
          hours: { create: hours.map((hour) => ({ day: dayToDate(day), hour })) },
          // Nieuwe uren krijgen opnieuw hun herinnering en, zo nodig, de melding
          // dat Theokot dicht is.
          reminderSentAt: reminderWindowPassed(bookedSpan(day, slot, hours).start, now) ? now : null,
          closedNoticeSentAt: null,
        },
      }),
    ]);
  } catch (error) {
    if (isTaken(error)) {
      revalidateAfwas();
      return saveError("TAKEN");
    }
    throw error;
  }
  const from = entry.day
    ? `${afwasDayLabel(dateToDay(entry.day), true)} ${hoursLabel(slot, entry.hours.map((row) => row.hour))}`
    : null;
  await logAudit({
    action: "update",
    entity: "theokotDishwash",
    entityId: entry.id,
    target: `Afwas ${entry.group.nameNl}`,
    summary: `${from ? `verzet van ${from} naar` : "gekozen:"} ${afwasDayLabel(day, true)} ${hoursLabel(slot, hours)} (${describeAfwas(entry.quantity, entry.kinds, true)})`,
  });
  revalidateAfwas();
  return saveOk();
}

export async function cancelAfwasAction(formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const entry = await prisma.theokotDishwash.findUnique({
    where: { id },
    select: {
      id: true,
      day: true,
      groupId: true,
      washedAt: true,
      quantity: true,
      kinds: true,
      hours: { select: { hour: true } },
      group: { select: { nameNl: true } },
    },
  });
  // Al weg (een tweede tabblad, of iemand anders was sneller): dan is het gebeurd.
  if (!entry) {
    revalidateAfwas();
    return saveOk();
  }

  const manage = canManageAfwas(session);
  if (!manage && !ownAfwasGroupIds(session).includes(entry.groupId)) return saveError("NOT_YOUR_GROUP");
  if (!manage) {
    // Wat afgewassen is of al begon, is geschiedenis: enkel Theokot en Logistiek ruimen dat op.
    if (entry.washedAt) return saveError("WASHED");
    const start = bookedStart(entry.day, entry.hours, await loadAfwasSlot());
    if (start && Date.now() >= start.getTime()) return saveError("PAST");
  }

  await prisma.theokotDishwash.delete({ where: { id: entry.id } });
  await logAudit({
    action: "delete",
    entity: "theokotDishwash",
    entityId: entry.id,
    target: `Afwas ${entry.group.nameNl}`,
    summary: `${describeAfwas(entry.quantity, entry.kinds, true)}; ${
      entry.day ? afwasDayLabel(dateToDay(entry.day), true) : "zonder namiddag"
    }`,
  });
  revalidateAfwas();
  return saveOk();
}

/** Afvinken of terugzetten. Zo staat "wie moet nog afwassen" altijd juist. */
export async function toggleAfwasWashedAction(formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const washed = formData.get("washed") === "true";
  const entry = await prisma.theokotDishwash.findUnique({
    where: { id },
    select: { id: true, groupId: true, quantity: true, kinds: true, group: { select: { nameNl: true } } },
  });
  if (!entry) return saveError("NOT_FOUND");
  if (!mayHandle(session, entry.groupId)) return saveError("NOT_YOUR_GROUP");

  await prisma.theokotDishwash.update({
    where: { id: entry.id },
    data: washed ? { washedAt: new Date(), washedById: session.user.id } : { washedAt: null, washedById: null },
  });
  await logAudit({
    action: "update",
    entity: "theokotDishwash",
    entityId: entry.id,
    target: `Afwas ${entry.group.nameNl}`,
    summary: `${washed ? "afgevinkt" : "terug op nog af te wassen"}: ${describeAfwas(entry.quantity, entry.kinds, true)}`,
  });
  revalidateAfwas();
  return saveOk();
}
