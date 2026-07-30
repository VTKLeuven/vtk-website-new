"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { Prisma } from "@prisma/client";
import { requirePermission, requireSession } from "@/lib/session";
import { brusselsWallClockMinutes, brusselsYMD, parseYMD, shiftYMD } from "@/lib/brussels";
import {
  findPianoSlot,
  isPianoSlotBookable,
  parseMinutes,
  pianoWeekRange,
  type PianoConfig,
} from "@/lib/piano";
import {
  getPianoConfig,
  getPianoRules,
  PIANO_CONFIG_KEY,
  PIANO_INFO_KEY,
} from "@/lib/piano-server";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

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

/**
 * Reserveert één tijdslot voor het ingelogde lid.
 *
 * De starttijd uit het formulier wordt niet vertrouwd: ze moet terugkomen uit
 * dezelfde slotberekening als degene die de pagina getekend heeft, anders kan je
 * met een zelfgemaakt formulier om het even welk uur boeken. De unieke index op
 * `startsAt` vangt daarnaast de race af waarin twee leden tegelijk hetzelfde slot
 * indrukken: de tweede krijgt een P2002 en dus een nette "al bezet"-melding.
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
  if (Number.isNaN(startsAt.getTime())) return saveError("notFound");

  const now = new Date();
  const config = await getPianoConfig();
  const { windows, closures } = await getPianoRules();

  const slot = findPianoSlot(windows, closures, startsAt, config.slotMinutes);
  if (!slot) return saveError("notFound");
  if (startsAt.getTime() <= now.getTime()) return saveError("past");
  if (!isPianoSlotBookable(startsAt, now, config)) return saveError("beyondHorizon");

  // Weeklimiet: enkel slots die nog moeten komen tellen mee. Een slot dat al
  // gespeeld is mag je week niet blokkeren.
  const week = pianoWeekRange(startsAt);
  const thisWeek = await prisma.pianoReservation.count({
    where: {
      userId: session.user.id,
      startsAt: { gte: week.from, lt: week.to },
      endsAt: { gt: now },
    },
  });
  if (thisWeek >= config.maxPerWeek) return saveError("weekLimit");

  try {
    await prisma.pianoReservation.create({
      data: { userId: session.user.id, startsAt: slot.startsAt, endsAt: slot.endsAt },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return saveError("taken");
    }
    throw err;
  }

  revalidatePiano();
  return saveOk();
}

/** Annuleert een eigen reservatie. Een reeds begonnen slot blijft staan. */
export async function cancelPianoReservationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await prisma.pianoReservation.deleteMany({
    where: { id, userId: session.user.id, startsAt: { gt: new Date() } },
  });
  revalidatePiano();
}

// -----------------------------------------------------------------------------
// Beheer: instellingen en infotekst
// -----------------------------------------------------------------------------

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
  } else {
    await prisma.pianoWindow.create({ data });
  }

  revalidatePiano();
  return saveOk();
}

export async function deletePianoWindowAction(formData: FormData): Promise<void> {
  await requirePermission("piano.manage");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await prisma.pianoWindow.delete({ where: { id } });
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

  revalidatePiano();
  return saveOk();
}

export async function deletePianoClosureAction(formData: FormData): Promise<void> {
  await requirePermission("piano.manage");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await prisma.pianoClosure.delete({ where: { id } });
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

  await prisma.pianoReservation.delete({ where: { id } });
  revalidatePiano();
}
