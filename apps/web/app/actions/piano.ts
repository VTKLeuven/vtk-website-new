"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission, requireSession } from "@/lib/session";
import { brusselsWallClockMinutes, brusselsYMD, parseYMD, shiftYMD } from "@/lib/brussels";
import { parseMinutes, type PianoConfig } from "@/lib/piano";
import { PIANO_CONFIG_KEY, PIANO_INFO_KEY } from "@/lib/piano-server";
import {
  cancelPianoReservation,
  PianoReservationError,
  reservePianoSlot,
} from "@/lib/piano-reservations";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";

const PUBLIC_PATHS = ["/piano", "/en/piano"];
const ADMIN_PATHS = ["/admin/piano", "/en/admin/piano"];

/** Beide talen én beide kanten: de agenda staat publiek én in het beheer. */
function revalidatePiano() {
  for (const path of [...PUBLIC_PATHS, ...ADMIN_PATHS]) revalidatePath(path);
}

/** "yyyy-mm-dd" → Brussel-middernacht, of null bij een onbestaande datum. */
function parseDay(value: FormDataEntryValue | null): Date | null {
  const ymd = typeof value === "string" ? parseYMD(value) : null;
  return ymd ? brusselsWallClockMinutes(ymd, 0) : null;
}

function parseIntField(value: FormDataEntryValue | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

// -----------------------------------------------------------------------------
// Leden: reserveren en annuleren
// -----------------------------------------------------------------------------

/** De foutcode uit `lib/piano-reservations.ts` naar de melding van dit scherm. */
function pianoErrorKey(error: PianoReservationError): string {
  switch (error.code) {
    case "NOT_FOUND":
      return "notFound";
    case "PAST":
      return "past";
    case "BEYOND_HORIZON":
      return "beyondHorizon";
    case "WEEK_LIMIT":
      return "weekLimit";
    case "TAKEN":
      return "taken";
  }
}

/**
 * Reserveert één tijdslot voor het ingelogde lid.
 *
 * De werking staat in `lib/piano-reservations.ts`, want de VTK-app roept
 * dezelfde functie aan. Wat hier blijft is wat bij een action hoort: de sessie
 * en de vertaling naar een meldingssleutel.
 */
export async function reservePianoSlotAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return saveError("notLoggedIn");
  }

  const raw = formData.get("startsAt");
  const startsAt = typeof raw === "string" ? new Date(raw) : new Date(NaN);

  try {
    await reservePianoSlot(session.user.id, startsAt);
  } catch (error) {
    if (error instanceof PianoReservationError) return saveError(pianoErrorKey(error));
    throw error;
  }

  return saveOk();
}

/** Annuleert een eigen reservatie. Een reeds begonnen slot blijft staan. */
export async function cancelPianoReservationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await cancelPianoReservation(session.user.id, id);
}

// -----------------------------------------------------------------------------
// Beheer: instellingen en infotekst
// -----------------------------------------------------------------------------

/** Dag in de tijdzone van het kasteel, voor in een logregel. */
function formatDay(value: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

/** "ma, wo van 18:00 tot 22:00" — genoeg om een venster te herkennen. */
function describeWindow(data: {
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  active: boolean;
}): string {
  const names = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const days = data.weekdays.map((d) => names[d - 1] ?? String(d)).join(", ");
  return `${days} van ${clock(data.startMinute)} tot ${clock(data.endMinute)}${
    data.active ? "" : " (niet actief)"
  }`;
}

export async function savePianoConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("piano.manage");

  const config: PianoConfig = {
    slotMinutes: parseIntField(formData.get("slotMinutes"), 60),
    maxPerWeek: parseIntField(formData.get("maxPerWeek"), 1),
    horizonDays: parseIntField(formData.get("horizonDays"), 28),
  };
  if (config.slotMinutes < 15 || config.slotMinutes > 24 * 60) return saveError("slotMinutes");
  if (config.maxPerWeek < 1 || config.maxPerWeek > 50) return saveError("maxPerWeek");
  if (config.horizonDays < 1 || config.horizonDays > 365) return saveError("horizonDays");

  await prisma.setting.upsert({
    where: { key: PIANO_CONFIG_KEY },
    update: { value: config },
    create: { key: PIANO_CONFIG_KEY, value: config },
  });
  await logAudit({
    action: "update",
    entity: "piano",
    target: "Piano-instellingen",
    summary: `slot van ${config.slotMinutes} min, max ${config.maxPerWeek}/week, ${config.horizonDays} dagen vooruit`,
  });
  revalidatePiano();
  return saveOk();
}

export async function savePianoInfoAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("piano.manage");

  const value = {
    bodyNl: ((formData.get("bodyNl") as string) ?? "").trim(),
    bodyEn: ((formData.get("bodyEn") as string) ?? "").trim(),
  };
  await prisma.setting.upsert({
    where: { key: PIANO_INFO_KEY },
    update: { value },
    create: { key: PIANO_INFO_KEY, value },
  });
  await logAudit({
    action: "update",
    entity: "piano",
    target: "Piano-infotekst",
    summary: "tekst op de pianopagina bewerkt",
  });
  revalidatePiano();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: beschikbaarheidsvensters
// -----------------------------------------------------------------------------

/** Maakt een venster aan, of werkt het bij wanneer er een `id` meekomt. */
export async function savePianoWindowAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("piano.manage");

  const labelNl = ((formData.get("labelNl") as string) ?? "").trim();
  if (!labelNl) return saveError("labelRequired");

  const weekdays = formData
    .getAll("weekdays")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  if (weekdays.length === 0) return saveError("weekdaysRequired");

  const startMinute = parseMinutes((formData.get("startTime") as string) ?? "");
  const endMinute = parseMinutes((formData.get("endTime") as string) ?? "");
  if (startMinute === null || endMinute === null) return saveError("timeInvalid");
  if (endMinute <= startMinute) return saveError("timeOrder");

  const startDate = parseDay(formData.get("startDate"));
  const endDate = parseDay(formData.get("endDate"));
  if (startDate && endDate && endDate < startDate) return saveError("dateOrder");

  const data = {
    labelNl,
    labelEn: ((formData.get("labelEn") as string) ?? "").trim() || null,
    weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
    startMinute,
    endMinute,
    startDate,
    endDate,
    active: formData.get("active") === "on",
    order: parseIntField(formData.get("order"), 0),
  };

  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await prisma.pianoWindow.update({ where: { id }, data });
    await logAudit({
      action: "update",
      entity: "piano",
      entityId: id,
      target: `Beschikbaarheid: ${labelNl}`,
      summary: describeWindow(data),
    });
  } else {
    const created = await prisma.pianoWindow.create({ data });
    await logAudit({
      action: "create",
      entity: "piano",
      entityId: created.id,
      target: `Beschikbaarheid: ${labelNl}`,
      summary: describeWindow(data),
    });
  }

  revalidatePiano();
  return saveOk();
}

export async function deletePianoWindowAction(formData: FormData): Promise<void> {
  await requirePermission("piano.manage");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const window = await prisma.pianoWindow.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "piano",
    entityId: id,
    target: `Beschikbaarheid: ${window.labelNl}`,
  });
  revalidatePiano();
}

// -----------------------------------------------------------------------------
// Beheer: sluitingsdagen
// -----------------------------------------------------------------------------

export async function savePianoClosureAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("piano.manage");

  const reasonNl = ((formData.get("reasonNl") as string) ?? "").trim();
  if (!reasonNl) return saveError("reasonRequired");

  const startDate = parseDay(formData.get("startDate"));
  // Eén dag sluiten is het gewone geval; dan mag het einde leeg blijven.
  const endDate = parseDay(formData.get("endDate")) ?? startDate;
  if (!startDate || !endDate) return saveError("dateInvalid");
  if (endDate < startDate) return saveError("dateOrder");

  await prisma.$transaction([
    prisma.pianoClosure.create({
      data: {
        startDate,
        endDate,
        reasonNl,
        reasonEn: ((formData.get("reasonEn") as string) ?? "").trim() || null,
      },
    }),
    // Wie al geboekt had binnen de sluiting, houdt anders een reservatie over voor
    // een slot dat niet meer bestaat. Het scherm zegt vooraf dat dit gebeurt.
    prisma.pianoReservation.deleteMany({
      where: {
        startsAt: {
          gte: startDate,
          lt: brusselsWallClockMinutes(shiftYMD(brusselsYMD(endDate), 1), 0),
        },
      },
    }),
  ]);

  await logAudit({
    action: "create",
    entity: "piano",
    target: `Sluiting: ${reasonNl}`,
    summary: `van ${formatDay(startDate)} tot ${formatDay(
      endDate,
    )}; reservaties in die periode zijn geschrapt`,
  });

  revalidatePiano();
  return saveOk();
}

export async function deletePianoClosureAction(formData: FormData): Promise<void> {
  await requirePermission("piano.manage");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const closure = await prisma.pianoClosure.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "piano",
    entityId: id,
    target: `Sluiting: ${closure.reasonNl}`,
    summary: "de piano is in die periode weer reserveerbaar",
  });
  revalidatePiano();
}

// -----------------------------------------------------------------------------
// Beheer: reservaties
// -----------------------------------------------------------------------------

/**
 * Schrapt de reservatie van een lid, bv. wanneer het kasteel alsnog dicht is.
 * Anders dan bij het lid zelf mag dit ook voor een slot dat al bezig is.
 */
export async function deletePianoReservationAction(formData: FormData): Promise<void> {
  await requirePermission("piano.manage");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const reservation = await prisma.pianoReservation.delete({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  await logAudit({
    action: "delete",
    entity: "pianoReservation",
    entityId: id,
    target: reservation.user.name,
    summary: `reservatie van ${formatDay(reservation.startsAt)} geschrapt`,
  });
  revalidatePiano();
}
