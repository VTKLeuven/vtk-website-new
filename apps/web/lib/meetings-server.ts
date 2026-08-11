/**
 * Server-only logica voor de broodjesmomenten (grocomeet en VTK Bureau): het
 * aanbod ophalen, reservaties koppelen aan de verkoopdag van Theokot, ze
 * ongeldig maken wanneer dat niet meer kan, en de aantallen die de
 * Theokot-voorraad afromen.
 *
 * De zuivere logica (semesters, vensters, drankjes, naamsleutel) staat in
 * `lib/meetings.ts`.
 */

import "server-only";

import { prisma } from "@vtk/db";
import type { Meeting, MeetingOption, Prisma } from "@prisma/client";

import { brusselsTimeOnDay } from "./brussels";
import { sendMeetingReservationInvalidated } from "./mail";
import {
  meetingKindLabel,
  meetingPath,
  offeringNameKey,
  parseMeetingDrinks,
  type MeetingDrinks,
} from "./meetings";

/** De drankkeuze en -prijs die voor alle momenten gelden. */
export async function getMeetingDrinks(): Promise<MeetingDrinks> {
  const row = await prisma.setting.findUnique({ where: { key: "meetings.drinks" } });
  return parseMeetingDrinks(row?.value);
}

/** De Theokot-verkoopdag op de kalenderdag van dit moment, indien die bestaat. */
export async function sessionForMeeting(meeting: { startsAt: Date }) {
  return prisma.theokotSession.findUnique({
    where: { date: brusselsTimeOnDay(meeting.startsAt, "00:00") },
    include: { items: { orderBy: { order: "asc" } } },
  });
}

export type MeetingSession = NonNullable<Awaited<ReturnType<typeof sessionForMeeting>>>;

/**
 * Eén keuze op het reservatieformulier. `key` is wat het formulier terugstuurt:
 * het id van een eigen optie, of de naamsleutel van een broodje uit Theokot (de
 * catalogus en het aanbod van die dag hebben verschillende id's, zie
 * {@link offeringNameKey}).
 */
export type MeetingChoice = {
  key: string;
  nameNl: string;
  nameEn: string | null;
  priceCents: number;
  /** Enkel bij Theokot-broodjes met een bestaande verkoopdag. */
  remaining: number | null;
  productId: string | null;
  optionId: string | null;
  sessionItemId: string | null;
};

/**
 * Waaruit iemand kan kiezen voor dit moment.
 *
 * - Eigen aanbod: de opties van het moment zelf.
 * - Theokot met een bestaande verkoopdag: het aanbod van die dag, zonder het
 *   broodje van de week (dat blijft voor de studenten) en met de resterende
 *   voorraad erbij.
 * - Theokot zonder verkoopdag (weken vooruit): de actieve catalogus, opnieuw
 *   zonder het weekslot. Wat er die week echt ligt, blijkt pas bij het aanmaken
 *   van de week; klopt het dan niet meer, dan wordt de reservatie ongeldig.
 */
export async function offeringForMeeting(
  meeting: Meeting & { options?: MeetingOption[] },
  session: MeetingSession | null,
): Promise<MeetingChoice[]> {
  if (!meeting.useTheokot) {
    const options =
      meeting.options ??
      (await prisma.meetingOption.findMany({ where: { meetingId: meeting.id }, orderBy: { order: "asc" } }));
    return options.map((option) => ({
      key: option.id,
      nameNl: option.nameNl,
      nameEn: option.nameEn,
      priceCents: option.priceCents,
      remaining: null,
      productId: null,
      optionId: option.id,
      sessionItemId: null,
    }));
  }

  if (session) {
    const items = session.items.filter((item) => !item.isWeeklySpecial);
    const used = await usageForSessionItems(items.map((item) => item.id));
    return items.map((item) => ({
      key: offeringNameKey(item.nameNl),
      nameNl: item.nameNl,
      nameEn: item.nameEn,
      priceCents: item.priceCents,
      remaining: Math.max(0, item.quantity - (used.get(item.id) ?? 0)),
      productId: item.productId,
      optionId: null,
      sessionItemId: item.id,
    }));
  }

  const products = await prisma.theokotProduct.findMany({
    where: { active: true, isWeeklySpecialSlot: false },
    orderBy: { order: "asc" },
  });
  return products.map((product) => ({
    key: offeringNameKey(product.nameNl),
    nameNl: product.nameNl,
    nameEn: product.nameEn,
    priceCents: product.priceCents,
    remaining: null,
    productId: product.id,
    optionId: null,
    sessionItemId: null,
  }));
}

/**
 * Hoeveel er van elk aanbod-item al weg is: bestellingen van studenten plus de
 * broodjes die voor een vergadering opzijgezet zijn. Beide komen uit dezelfde
 * voorraad, dus wie enkel de bestellijnen telt, verkoopt de GM-broodjes een
 * tweede keer.
 */
export async function usageForSessionItems(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const [lines, reservations] = await Promise.all([
    prisma.theokotOrderLine.groupBy({
      by: ["sessionItemId"],
      where: { sessionItemId: { in: itemIds } },
      _sum: { quantity: true },
    }),
    prisma.meetingReservation.groupBy({
      by: ["sessionItemId"],
      where: { sessionItemId: { in: itemIds }, status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);

  const used = new Map<string, number>();
  for (const line of lines) used.set(line.sessionItemId, line._sum.quantity ?? 0);
  for (const reservation of reservations) {
    if (!reservation.sessionItemId) continue;
    used.set(
      reservation.sessionItemId,
      (used.get(reservation.sessionItemId) ?? 0) + reservation._count._all,
    );
  }
  return used;
}

/**
 * Dezelfde telling binnen een lopende transactie (bestellen van een student).
 * Bewust na elkaar en niet met `Promise.all`: queries van één interactieve
 * transactie horen op één verbinding, in volgorde.
 */
export async function usageForSessionItemsTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<Map<string, number>> {
  const lines = await tx.theokotOrderLine.groupBy({
    by: ["sessionItemId"],
    where: { sessionItem: { sessionId } },
    _sum: { quantity: true },
  });
  const reservations = await tx.meetingReservation.groupBy({
    by: ["sessionItemId"],
    where: { sessionItem: { sessionId }, status: "ACTIVE" },
    _count: { _all: true },
  });

  const used = new Map<string, number>();
  for (const line of lines) used.set(line.sessionItemId, line._sum.quantity ?? 0);
  for (const reservation of reservations) {
    if (!reservation.sessionItemId) continue;
    used.set(
      reservation.sessionItemId,
      (used.get(reservation.sessionItemId) ?? 0) + reservation._count._all,
    );
  }
  return used;
}

// -----------------------------------------------------------------------------
// Koppelen en ongeldig maken
// -----------------------------------------------------------------------------

export type SyncResult = { linked: number; invalidated: number };

/**
 * Legt de reservaties van een moment naast het aanbod van die dag.
 *
 * Een reservatie wordt weken vooraf gemaakt uit de catalogus; pas wanneer
 * Theokot die week aanmaakt, bestaat het aanbod-item waar ze aan hangt. Deze
 * functie koppelt beide (op naam, zie {@link offeringNameKey}) en maakt de
 * reservatie ongeldig wanneer dat broodje er die dag niet is: dan krijgt de
 * persoon een mail en ziet die op de reservatiepagina dat er opnieuw gekozen
 * moet worden.
 *
 * Draait bij elke wijziging die het aanbod van die dag kan veranderen: een week
 * aanmaken, het aanbod van een dag bewerken, een dag sluiten, en bij het
 * verzetten of omschakelen van het moment zelf.
 */
export async function syncMeetingReservations(meetingId: string): Promise<SyncResult> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { options: true, reservations: { include: { user: true } } },
  });
  if (!meeting) return { linked: 0, invalidated: 0 };

  const session = meeting.useTheokot ? await sessionForMeeting(meeting) : null;
  // Zolang de verkoopdag niet bestaat, valt er niets te controleren: het aanbod
  // van die week is nog niet beslist. De reservatie blijft staan en wordt
  // gekoppeld zodra Theokot de week aanmaakt.
  if (meeting.useTheokot && !session) return { linked: 0, invalidated: 0 };

  const byKey = new Map<string, MeetingChoice>();
  for (const choice of await offeringForMeeting(meeting, session)) byKey.set(choice.key, choice);
  const sessionClosed = session !== null && !session.isOpen;

  let linked = 0;
  let invalidated = 0;

  for (const reservation of meeting.reservations) {
    if (reservation.status !== "ACTIVE") continue;
    // Enkel een drankje: daar verandert een gewijzigd broodjesaanbod niets aan.
    if (!reservation.itemNameNl) continue;

    const key = reservation.optionId ?? offeringNameKey(reservation.itemNameNl);
    const choice = sessionClosed ? undefined : byKey.get(key);

    if (!choice) {
      const reason = sessionClosed
        ? "Theokot is die dag gesloten."
        : "Dit broodje staat niet op het aanbod van die dag.";
      await prisma.meetingReservation.update({
        where: { id: reservation.id },
        data: {
          status: "INVALIDATED",
          invalidatedAt: new Date(),
          invalidatedReason: reason,
          sessionItemId: null,
        },
      });
      invalidated += 1;
      await notifyInvalidated(meeting, reservation.user, reason);
      continue;
    }

    if (reservation.sessionItemId !== choice.sessionItemId) {
      await prisma.meetingReservation.update({
        where: { id: reservation.id },
        data: { sessionItemId: choice.sessionItemId },
      });
      linked += 1;
    }
  }

  return { linked, invalidated };
}

/** Idem, voor elk moment op de kalenderdag van een verkoopdag. */
export async function syncMeetingsForSession(sessionId: string): Promise<SyncResult> {
  const session = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });
  if (!session) return { linked: 0, invalidated: 0 };
  return syncMeetingsOnDay(session.date);
}

/** Idem, voor elk moment op deze kalenderdag (Brussel). */
export async function syncMeetingsOnDay(day: Date): Promise<SyncResult> {
  const from = brusselsTimeOnDay(day, "00:00");
  const to = new Date(from.getTime() + 86400000);
  const meetings = await prisma.meeting.findMany({
    where: { startsAt: { gte: from, lt: to } },
    select: { id: true },
  });

  const total: SyncResult = { linked: 0, invalidated: 0 };
  for (const meeting of meetings) {
    const result = await syncMeetingReservations(meeting.id);
    total.linked += result.linked;
    total.invalidated += result.invalidated;
  }
  return total;
}

async function notifyInvalidated(
  meeting: Meeting,
  user: { name: string; email: string; locale: "NL" | "EN" },
  reason: string,
): Promise<void> {
  const nl = user.locale !== "EN";
  const dateLabel = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(meeting.startsAt);

  try {
    await sendMeetingReservationInvalidated(user, {
      meetingLabel: meetingKindLabel(meeting.kind, nl),
      dateLabel,
      reason,
      path: meetingPath(meeting.kind, meeting.slug, nl ? "" : "/en"),
    });
  } catch (error) {
    // De reservatie is en blijft ongeldig; een mislukte mail mag het opslaan van
    // het gewijzigde aanbod niet tegenhouden. De melding op de site blijft staan.
    console.error("[meetings] mail over ongeldige reservatie mislukt:", error);
  }
}

// -----------------------------------------------------------------------------
// Meldingen en overzichten
// -----------------------------------------------------------------------------

/**
 * Moet dit lid ergens opnieuw kiezen? Voor de stip in het profielmenu, dat op elke
 * pagina getekend wordt: daar hoort een telling en geen volledige lijst.
 */
export async function hasPendingMeetingNotice(userId: string, now: Date = new Date()): Promise<boolean> {
  const count = await prisma.meetingReservation.count({
    where: { userId, status: "INVALIDATED", meeting: { startsAt: { gte: now } } },
  });
  return count > 0;
}
