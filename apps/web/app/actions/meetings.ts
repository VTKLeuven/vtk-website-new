"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import type { MeetingKind } from "@prisma/client";
import { requirePermission, requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import { brusselsTimeOnDay, ymdKey } from "@/lib/brussels";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import {
  meetingCloseAt,
  meetingWindowState,
  parseDayValue,
  semesterForDate,
  type Semester,
} from "@/lib/meetings";
import { currentWorkingYear } from "@/lib/workingYear";
import {
  getMeetingDrinks,
  offeringForMeeting,
  sessionForMeeting,
  syncMeetingReservations,
  usageForSessionItemsTx,
} from "@/lib/meetings-server";

// -----------------------------------------------------------------------------
// Hulpfuncties
// -----------------------------------------------------------------------------

/**
 * Wie dit soort moment mag beheren. De GM hoort bij Groep 5 en het Bureau bij
 * Onderwijs; ze zien elkaars schermen dus niet, ook al draaien ze op dezelfde code.
 */
async function requireMeetingManager(kind: MeetingKind) {
  return requirePermission(kind === "GROCOMEET" ? "grocomeet.manage" : "bureau.manage");
}

function adminPath(kind: MeetingKind): string {
  return kind === "GROCOMEET" ? "/admin/grocomeet" : "/admin/bureau";
}

/** Vernieuwt de schermen die op dit moment steunen, in beide talen. */
function revalidateMeeting(kind: MeetingKind, slug?: string) {
  revalidatePath(adminPath(kind));
  if (kind === "GROCOMEET") {
    revalidatePath("/grocomeet");
    revalidatePath("/en/grocomeet");
  } else {
    revalidatePath("/bureau");
    revalidatePath("/en/bureau");
    revalidatePath("/bureau-inschrijving");
    revalidatePath("/en/bureau-inschrijving");
    if (slug) {
      revalidatePath(`/bureau/${slug}`);
      revalidatePath(`/en/bureau/${slug}`);
    }
  }
  // De broodjes van een vergadering gaan van dezelfde voorraad af als die van de
  // studenten, dus de bestelpagina en de turflijst kloppen anders niet meer.
  revalidatePath("/theokot");
  revalidatePath("/en/theokot");
  revalidatePath("/admin/theokot/turflijst");
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseKind(value: FormDataEntryValue | null): MeetingKind | null {
  return value === "GROCOMEET" || value === "BUREAU" ? value : null;
}

function parseSemester(value: FormDataEntryValue | null): Semester | null {
  const n = Number(value);
  return n === 1 || n === 2 ? (n as Semester) : null;
}

/** "YYYY-MM-DDTHH:mm" uit een datetime-local, als Brussel-wandkloktijd. */
function parseLocalDateTime(raw: string | null | undefined): Date | null {
  const match = raw?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  const day = parseDayValue(match[1]);
  if (!day) return null;
  return brusselsTimeOnDay(day, match[2]);
}

/**
 * Een leesbare, unieke sleutel voor de deelbare link: "bureau-2026-10-15". Bij
 * twee momenten op dezelfde dag komt er een volgnummer bij.
 */
async function uniqueSlug(kind: MeetingKind, startsAt: Date): Promise<string> {
  const prefix = kind === "GROCOMEET" ? "gm" : "bureau";
  const base = `${prefix}-${ymdKey(dayParts(startsAt))}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.meeting.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  return `${base}-${Date.now()}`;
}

function dayParts(date: Date) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-")
    .map(Number);
  return { year, month, day };
}

// -----------------------------------------------------------------------------
// Beheer: de kalender van een semester invullen
// -----------------------------------------------------------------------------

/** "Bureau van 12/03/2026 12:30" — genoeg om een moment te herkennen in het logboek. */
function meetingLabel(kind: MeetingKind, startsAt: Date): string {
  const when = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(startsAt);
  return `${kind === "BUREAU" ? "Bureau" : "Grocomeet"} van ${when}`;
}

/**
 * Zet de momenten van één semester klaar vanuit de kalender: elke aangeduide dag
 * wordt een moment, met haar eigen uur en plaats. Die twee staan per dag, want
 * een vergadering verhuist geregeld naar een ander lokaal of een ander uur.
 *
 * Bestaande dagen worden bijgewerkt met wat de kalender toont (de velden staan er
 * ingevuld met de huidige waarden, dus opnieuw opslaan verandert niets zolang je
 * niets aanraakt). Weggeklikte dagen verdwijnen enkel wanneer er nog niets voor
 * gereserveerd is: een moment met reservaties weghalen zou zonder waarschuwing
 * bestellingen van anderen wissen.
 */
export async function planMeetingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const kind = parseKind(formData.get("kind"));
  if (!kind) return saveError("INVALID_INPUT");
  const session = await requireMeetingManager(kind);

  const year = Number(formData.get("year"));
  const semester = parseSemester(formData.get("semester"));
  if (!Number.isInteger(year) || !semester) return saveError("INVALID_INPUT");

  const opensDaysRaw = Number(formData.get("opensDaysBefore"));
  const opensDaysBefore =
    kind === "BUREAU" && Number.isInteger(opensDaysRaw) && opensDaysRaw > 0 ? opensDaysRaw : null;

  const dayCount = Number(formData.get("dayCount")) || 0;
  const days: Array<{ day: Date; time: string; location: string | null }> = [];
  for (let i = 0; i < dayCount; i += 1) {
    const day = parseDayValue(String(formData.get(`day-${i}-date`) ?? ""));
    if (!day) continue;
    const time = String(formData.get(`day-${i}-time`) ?? "");
    if (!HHMM.test(time)) return saveError("INVALID_TIME");
    days.push({
      day,
      time,
      location: String(formData.get(`day-${i}-location`) ?? "").trim() || null,
    });
  }

  const existing = await prisma.meeting.findMany({
    where: { kind, year, semester },
    include: { _count: { select: { reservations: true } } },
  });
  const existingByDay = new Map(existing.map((meeting) => [ymdKey(dayParts(meeting.startsAt)), meeting]));
  const keptDays = new Set<string>();

  for (const entry of days) {
    const key = ymdKey(dayParts(entry.day));
    keptDays.add(key);
    const startsAt = brusselsTimeOnDay(entry.day, entry.time);
    const current = existingByDay.get(key);

    if (current) {
      // Enkel schrijven wanneer er echt iets verandert, zodat `updatedAt` niet bij
      // elke herbevestiging van de kalender verspringt.
      if (current.startsAt.getTime() !== startsAt.getTime() || current.location !== entry.location) {
        await prisma.meeting.update({
          where: { id: current.id },
          data: { startsAt, location: entry.location },
        });
      }
      continue;
    }

    await prisma.meeting.create({
      data: {
        kind,
        year,
        semester,
        slug: await uniqueSlug(kind, startsAt),
        startsAt,
        location: entry.location,
        opensAt: opensDaysBefore ? new Date(startsAt.getTime() - opensDaysBefore * 86400000) : null,
        createdById: session.user.id,
      },
    });
  }

  let keptWithReservations = 0;
  for (const meeting of existing) {
    const key = ymdKey(dayParts(meeting.startsAt));
    if (keptDays.has(key)) continue;
    if (meeting._count.reservations > 0) {
      keptWithReservations += 1;
      continue;
    }
    await prisma.meeting.delete({ where: { id: meeting.id } });
  }

  await prisma.meetingPlan.upsert({
    where: { kind_year_semester: { kind, year, semester } },
    update: { plannedById: session.user.id },
    create: { kind, year, semester, plannedById: session.user.id },
  });

  await logAudit({
    action: "update",
    entity: "meeting",
    target: `${kind === "BUREAU" ? "Bureau" : "Grocomeet"} ${year}, semester ${semester}`,
    summary: `${days.length} moment(en) ingepland${
      keptWithReservations > 0
        ? `; ${keptWithReservations} dag(en) met reservaties bleven staan`
        : ""
    }`,
  });

  revalidateMeeting(kind);
  // Geen stille afloop: wie een dag wegklikte waar al voor besteld is, moet weten
  // dat die dag er nog staat.
  return keptWithReservations > 0 ? saveError("KEPT_WITH_RESERVATIONS") : saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: één moment
// -----------------------------------------------------------------------------

export async function createMeetingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const kind = parseKind(formData.get("kind"));
  if (!kind) return saveError("INVALID_INPUT");
  const session = await requireMeetingManager(kind);

  const startsAt = parseLocalDateTime(String(formData.get("startsAt") ?? ""));
  if (!startsAt) return saveError("INVALID_DATE");

  const location = String(formData.get("location") ?? "").trim() || null;
  const year = Number(formData.get("year"));

  const created = await prisma.meeting.create({
    data: {
      kind,
      year: Number.isInteger(year) ? year : currentWorkingYear(startsAt),
      semester: semesterForDate(startsAt),
      slug: await uniqueSlug(kind, startsAt),
      startsAt,
      location,
      createdById: session.user.id,
    },
  });

  await logAudit({
    action: "create",
    entity: "meeting",
    entityId: created.id,
    target: meetingLabel(kind, startsAt),
    summary: location ? `in ${location}` : null,
  });

  revalidateMeeting(kind);
  return saveOk();
}

/** Uur, plaats, opening, toelichting en de aanbodbron van één moment. */
export async function saveMeetingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const id = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return saveError("NOT_FOUND");
  await requireMeetingManager(meeting.kind);

  const startsAt = parseLocalDateTime(String(formData.get("startsAt") ?? ""));
  if (!startsAt) return saveError("INVALID_DATE");
  const opensAt = parseLocalDateTime(String(formData.get("opensAt") ?? ""));
  const useTheokot = formData.get("useTheokot") === "on";

  await prisma.meeting.update({
    where: { id },
    data: {
      startsAt,
      year: currentWorkingYear(startsAt),
      semester: semesterForDate(startsAt),
      location: String(formData.get("location") ?? "").trim() || null,
      opensAt,
      useTheokot,
      noteNl: String(formData.get("noteNl") ?? "").trim() || null,
      noteEn: String(formData.get("noteEn") ?? "").trim() || null,
    },
  });

  await logAudit({
    action: "update",
    entity: "meeting",
    entityId: id,
    target: meetingLabel(meeting.kind, startsAt),
    summary:
      meeting.startsAt.getTime() === startsAt.getTime()
        ? "plaats, opening of toelichting gewijzigd"
        : `verplaatst vanaf ${meetingLabel(meeting.kind, meeting.startsAt)}`,
  });

  // Een ander uur betekent een andere verkoopdag, en een omgeschakeld aanbod
  // betekent een ander lijstje broodjes: allebei kunnen bestaande reservaties
  // onmogelijk maken.
  await syncMeetingReservations(id);
  revalidateMeeting(meeting.kind, meeting.slug);
  return saveOk();
}

/** Void, zodat `DeleteIconButton` deze rechtstreeks kan aanroepen. */
export async function deleteMeetingAction(formData: FormData): Promise<void> {
  const id = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return;
  await requireMeetingManager(meeting.kind);

  await prisma.meeting.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "meeting",
    entityId: id,
    target: meetingLabel(meeting.kind, meeting.startsAt),
    summary: "het moment en alle reservaties erop zijn weg",
  });
  revalidateMeeting(meeting.kind, meeting.slug);
}

/**
 * Het eigen aanbod van een moment (lasagne, broodjes van een bakker). Rijen komen
 * als `option-<i>-{id,nameNl,nameEn,price}` plus `optionCount`.
 */
export async function saveMeetingOptionsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const id = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meeting.findUnique({ where: { id }, include: { options: true } });
  if (!meeting) return saveError("NOT_FOUND");
  await requireMeetingManager(meeting.kind);

  const count = Number(formData.get("optionCount")) || 0;
  const keepIds = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    const nameNl = String(formData.get(`option-${i}-nameNl`) ?? "").trim();
    if (!nameNl) continue;
    const optionId = String(formData.get(`option-${i}-id`) ?? "");
    const data = {
      nameNl,
      nameEn: String(formData.get(`option-${i}-nameEn`) ?? "").trim() || null,
      priceCents: euroToCents(formData.get(`option-${i}-price`)) ?? 0,
      order: i,
    };
    if (optionId) {
      keepIds.add(optionId);
      await prisma.meetingOption.update({ where: { id: optionId }, data });
    } else {
      const created = await prisma.meetingOption.create({ data: { ...data, meetingId: id } });
      keepIds.add(created.id);
    }
  }

  for (const option of meeting.options) {
    if (!keepIds.has(option.id)) await prisma.meetingOption.delete({ where: { id: option.id } });
  }

  await logAudit({
    action: "update",
    entity: "meeting",
    entityId: id,
    target: meetingLabel(meeting.kind, meeting.startsAt),
    summary: `aanbod aangepast naar ${keepIds.size} keuze(s)`,
  });

  // Een geschrapte keuze maakt de reservaties die erop stonden ongeldig.
  await syncMeetingReservations(id);
  revalidateMeeting(meeting.kind, meeting.slug);
  return saveOk();
}

/** "2,60" / "2.60" / "€2,60" -> 260 eurocent. Null bij ongeldige invoer. */
function euroToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** De drankkeuze en -prijs, gedeeld door alle momenten. */
export async function saveMeetingDrinksAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const kind = parseKind(formData.get("kind"));
  if (!kind) return saveError("INVALID_INPUT");
  await requireMeetingManager(kind);

  const items = String(formData.get("items") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (items.length === 0) return saveError("NO_DRINKS");

  const priceCents = euroToCents(formData.get("price"));
  if (priceCents === null) return saveError("INVALID_PRICE");

  const value = { priceCents, items };
  await prisma.setting.upsert({
    where: { key: "meetings.drinks" },
    update: { value },
    create: { key: "meetings.drinks", value },
  });

  await logAudit({
    action: "update",
    entity: "meeting",
    target: "Drankaanbod",
    summary: `${items.length} drank(en) aan ${(priceCents / 100).toFixed(2)} euro`,
  });

  revalidatePath(adminPath("GROCOMEET"));
  revalidatePath(adminPath("BUREAU"));
  revalidateMeeting(kind);
  return saveOk();
}

/** Vinkt af dat iemand zijn broodje en drankje betaald heeft (enkel de GM). */
export async function toggleReservationPaidAction(formData: FormData): Promise<void> {
  const id = String(formData.get("reservationId") ?? "");
  const reservation = await prisma.meetingReservation.findUnique({
    where: { id },
    include: { meeting: { select: { kind: true } } },
  });
  if (!reservation) return;
  const session = await requireMeetingManager(reservation.meeting.kind);

  await prisma.meetingReservation.update({
    where: { id },
    data: reservation.paidAt
      ? { paidAt: null, paidById: null }
      : { paidAt: new Date(), paidById: session.user.id },
  });

  const buyer = await prisma.user.findUnique({
    where: { id: reservation.userId },
    select: { name: true },
  });
  await logAudit({
    action: "update",
    entity: "meetingReservation",
    entityId: id,
    target: buyer?.name ?? reservation.userId,
    summary: reservation.paidAt ? "afgevinkt als niet betaald" : "afgevinkt als betaald",
  });

  revalidatePath(adminPath(reservation.meeting.kind));
}

// -----------------------------------------------------------------------------
// Reserveren
// -----------------------------------------------------------------------------

/**
 * Bewaart de keuze van één persoon voor één moment: een broodje, een drankje,
 * allebei of geen van beide (dan verdwijnt de reservatie).
 *
 * De prijzen worden hier vastgeklikt: wat de catalogus later doet met haar
 * prijzen, mag een openstaande schuld niet veranderen. Het broodje gaat binnen
 * dezelfde transactie van de voorraad af als de bestellingen van studenten.
 */
export async function saveMeetingReservationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const meetingId = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!meeting) return saveError("NOT_FOUND");

  const session =
    meeting.kind === "GROCOMEET" ? await requirePermission("grocomeet.reserve") : await requireSession();
  const userId = session.user.id;

  const theokotSession = await sessionForMeeting(meeting);
  const now = new Date();
  const state = meetingWindowState(meeting, theokotSession, now);
  if (state === "UPCOMING") return saveError("NOT_OPEN_YET");
  if (state === "CLOSED") return saveError("CLOSED");

  const choiceKey = String(formData.get("choice") ?? "");
  const drinkName = String(formData.get("drink") ?? "").trim();
  const comment =
    meeting.kind === "BUREAU" ? String(formData.get("comment") ?? "").trim() || null : null;

  const drinks = await getMeetingDrinks();
  if (drinkName && !drinks.items.includes(drinkName)) return saveError("UNKNOWN_DRINK");

  const offering = await offeringForMeeting(meeting, theokotSession);
  const choice = choiceKey ? offering.find((option) => option.key === choiceKey) : undefined;
  if (choiceKey && !choice) return saveError("UNKNOWN_CHOICE");

  // Niets gekozen: dan is er ook niets te bewaren.
  if (!choice && !drinkName) {
    await prisma.meetingReservation.deleteMany({ where: { meetingId, userId } });
    revalidateMeeting(meeting.kind, meeting.slug);
    return saveOk();
  }

  try {
    await withSerializableTransaction(async (tx) => {
      if (choice?.sessionItemId && theokotSession) {
        const used = await usageForSessionItemsTx(tx, theokotSession.id);
        const item = theokotSession.items.find((row) => row.id === choice.sessionItemId);
        const existing = await tx.meetingReservation.findUnique({
          where: { meetingId_userId: { meetingId, userId } },
          select: { sessionItemId: true, status: true },
        });
        // De eigen, nog actieve reservatie op ditzelfde broodje telt al mee in
        // `used`; anders kan niemand zijn eigen keuze bevestigen bij het laatste
        // exemplaar.
        const ownAlreadyCounted =
          existing?.status === "ACTIVE" && existing.sessionItemId === choice.sessionItemId ? 1 : 0;
        const taken = (used.get(choice.sessionItemId) ?? 0) - ownAlreadyCounted;
        if (item && taken >= item.quantity) throw new Error("SOLD_OUT");
      }

      const data = {
        status: "ACTIVE" as const,
        itemNameNl: choice?.nameNl ?? null,
        itemNameEn: choice?.nameEn ?? null,
        itemPriceCents: choice?.priceCents ?? 0,
        productId: choice?.productId ?? null,
        optionId: choice?.optionId ?? null,
        sessionItemId: choice?.sessionItemId ?? null,
        drinkName: drinkName || null,
        drinkPriceCents: drinkName ? drinks.priceCents : 0,
        comment,
        invalidatedAt: null,
        invalidatedReason: null,
      };

      await tx.meetingReservation.upsert({
        where: { meetingId_userId: { meetingId, userId } },
        update: data,
        create: { ...data, meetingId, userId },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SOLD_OUT") return saveError("SOLD_OUT");
    throw error;
  }

  revalidateMeeting(meeting.kind, meeting.slug);
  return saveOk();
}

/** Haalt de eigen reservatie weg (broodje noch drankje). Void voor `DeleteButton`. */
export async function cancelMeetingReservationAction(formData: FormData): Promise<void> {
  const meetingId = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return;

  const session =
    meeting.kind === "GROCOMEET" ? await requirePermission("grocomeet.reserve") : await requireSession();

  const theokotSession = await sessionForMeeting(meeting);
  if (new Date() >= meetingCloseAt(meeting, theokotSession)) return;

  await prisma.meetingReservation.deleteMany({ where: { meetingId, userId: session.user.id } });
  revalidateMeeting(meeting.kind, meeting.slug);
}
