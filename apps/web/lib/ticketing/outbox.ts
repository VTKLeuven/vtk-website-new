import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@vtk/db";
import { createOrderAccessToken } from "./crypto";
import {
  attendeeMessageMail,
  orderConfirmationMail,
  sendMail,
  ticketCancelledMail,
  ticketChangedMail,
  type OrderMailLine,
} from "./mail";
import { orderMailBundle } from "./mailBundle";
import { ticketingBaseUrl } from "./config";
import { ticketPosterSelect, ticketPosterUrl } from "./poster";

type ClaimedMessage = {
  id: string;
  type: string;
  orderId: string | null;
  recipient: string;
  payload: unknown;
  attempts: number;
};

/** Mail aan de koper dat het beheer een van zijn tickets verwijderde. */
export const TICKET_CANCELLED = "TICKET_CANCELLED";

export type TicketCancelledPayload = {
  orderItemId: string;
  reason: string;
  /** Wat er via de site teruggaat; `null` wanneer er niets terugging. */
  refundCents: number | null;
};

/** Mail aan de koper dat het beheer een van zijn tickets van type wisselde. */
export const TICKET_CHANGED = "TICKET_CHANGED";

export type TicketChangedPayload = {
  orderItemId: string;
  fromName: string;
  toName: string;
  message: string | null;
};

/**
 * Een bericht van de organisator aan de deelnemers (tabblad Deelnemers). Eén
 * rij per adres; `orderId` is een bestelling van die ontvanger, zodat het
 * wissen van een account ook dit bericht opruimt.
 */
export const ATTENDEE_MESSAGE = "ATTENDEE_MESSAGE";

export type AttendeeMessagePayload = {
  name: string | null;
  subject: string;
  message: string;
  senderName: string | null;
  locale: "nl" | "en";
};

async function claimMessages(workerId: string, limit: number): Promise<ClaimedMessage[]> {
  return prisma.$queryRaw<ClaimedMessage[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "TicketOutboxMessage"
      WHERE "status" IN ('PENDING', 'FAILED', 'PROCESSING')
        AND "availableAt" <= NOW()
        AND (
          "status" <> 'PROCESSING'
          OR "lockedAt" IS NULL
          OR "lockedAt" < NOW() - INTERVAL '5 minutes'
        )
      -- Een bericht aan alle deelnemers zijn er al snel honderden; die mogen
      -- de bevestiging van wie net een ticket kocht niet minutenlang ophouden.
      ORDER BY ("type" = 'ATTENDEE_MESSAGE') ASC, "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "TicketOutboxMessage" AS message
    SET
      "status" = 'PROCESSING'::"TicketOutboxStatus",
      "lockedAt" = NOW(),
      "lockedBy" = ${workerId},
      "attempts" = message."attempts" + 1,
      "updatedAt" = NOW()
    FROM candidates
    WHERE message."id" = candidates."id"
    RETURNING message."id", message."type", message."orderId", message."recipient", message."payload", message."attempts"
  `;
}

/**
 * De bestellijnen zoals de mail ze toont: per tickettype en prijs één regel,
 * dezelfde groepering als op de bestelpagina (`orderLines` in queries.ts). Twee
 * tickets van hetzelfde type aan een verschillende prijs (lid en niet-lid)
 * blijven dus twee regels.
 */
function orderMailLines(
  items: Array<{ ticketTypeId: string; ticketTypeName: string; unitPriceCents: number; totalCents: number }>
): OrderMailLine[] {
  const lines = new Map<string, OrderMailLine>();
  for (const item of items) {
    const key = `${item.ticketTypeId}:${item.unitPriceCents}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += 1;
      line.totalCents += item.totalCents;
    } else {
      lines.set(key, {
        name: item.ticketTypeName,
        quantity: 1,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
      });
    }
  }
  return [...lines.values()];
}

function isCancelledPayload(payload: unknown): payload is TicketCancelledPayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return (
    typeof value.orderItemId === "string" &&
    typeof value.reason === "string" &&
    (value.refundCents === null || typeof value.refundCents === "number")
  );
}

async function deliverCancellation(message: ClaimedMessage): Promise<string> {
  if (!isCancelledPayload(message.payload)) throw new Error("Invalid cancellation payload");
  const payload = message.payload;
  const item = await prisma.ticketOrderItem.findUnique({
    where: { id: payload.orderItemId },
    include: {
      order: {
        include: {
          event: true,
          // Wat de koper nog heeft, op het moment dat de mail vertrekt.
          items: { where: { ticket: { is: { status: "VALID" } } }, select: { id: true } },
        },
      },
    },
  });
  if (!item) throw new Error("Order item not found");
  const { order } = item;
  const locale = order.locale === "EN" ? "en" : "nl";
  return sendMail(
    ticketCancelledMail({
      locale,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      attendeeName: item.attendeeName,
      ticketTypeName: item.ticketTypeName,
      eventName: locale === "en" && order.event.titleEn ? order.event.titleEn : order.event.titleNl,
      orderNumber: order.reference,
      reason: payload.reason,
      refund:
        payload.refundCents && payload.refundCents > 0
          ? { amountCents: payload.refundCents, currency: order.currency }
          : null,
      remainingTickets: order.items.filter((other) => other.id !== item.id).length,
      replyTo: order.event.contactEmail,
      event: {
        startsAt: order.event.startsAt,
        timeZone: order.event.timeZone,
        location: order.event.location,
      },
    })
  );
}

function isChangedPayload(payload: unknown): payload is TicketChangedPayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return (
    typeof value.orderItemId === "string" &&
    typeof value.fromName === "string" &&
    typeof value.toName === "string" &&
    (value.message === null || typeof value.message === "string")
  );
}

async function deliverChange(message: ClaimedMessage): Promise<string> {
  if (!isChangedPayload(message.payload)) throw new Error("Invalid change payload");
  const payload = message.payload;
  const item = await prisma.ticketOrderItem.findUnique({
    where: { id: payload.orderItemId },
    include: { order: { include: { event: true } } },
  });
  if (!item) throw new Error("Order item not found");
  const { order } = item;
  const locale = order.locale === "EN" ? "en" : "nl";
  const access = createOrderAccessToken(order.id, order.accessExpiresAt);
  const prefix = locale === "en" ? "/en" : "";
  return sendMail(
    ticketChangedMail({
      locale,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      attendeeName: item.attendeeName,
      fromName: payload.fromName,
      toName: payload.toName,
      eventName: locale === "en" && order.event.titleEn ? order.event.titleEn : order.event.titleNl,
      orderNumber: order.reference,
      orderUrl: `${ticketingBaseUrl()}${prefix}/tickets/toegang?orderId=${encodeURIComponent(order.id)}#access=${encodeURIComponent(access)}`,
      message: payload.message,
      replyTo: order.event.contactEmail,
      event: {
        startsAt: order.event.startsAt,
        timeZone: order.event.timeZone,
        location: order.event.location,
      },
    })
  );
}

function isAttendeeMessagePayload(payload: unknown): payload is AttendeeMessagePayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return (
    (value.name === null || typeof value.name === "string") &&
    typeof value.subject === "string" &&
    typeof value.message === "string" &&
    (value.senderName === null || typeof value.senderName === "string") &&
    (value.locale === "nl" || value.locale === "en")
  );
}

async function deliverAttendeeMessage(message: ClaimedMessage): Promise<string> {
  if (!isAttendeeMessagePayload(message.payload)) throw new Error("Invalid attendee message payload");
  const payload = message.payload;
  const event = message.orderId
    ? (await prisma.ticketOrder.findUnique({ where: { id: message.orderId }, include: { event: true } }))?.event
    : null;
  if (!event) throw new Error("Event not found");
  const locale = payload.locale;
  return sendMail(
    attendeeMessageMail({
      locale,
      to: message.recipient,
      name: payload.name,
      eventName: locale === "en" && event.titleEn ? event.titleEn : event.titleNl,
      subject: payload.subject,
      message: payload.message,
      senderName: payload.senderName,
      replyTo: event.contactEmail,
      event: { startsAt: event.startsAt, timeZone: event.timeZone, location: event.location },
    })
  );
}

async function deliver(message: ClaimedMessage): Promise<string> {
  if (message.type === TICKET_CANCELLED) return deliverCancellation(message);
  if (message.type === TICKET_CHANGED) return deliverChange(message);
  if (message.type === ATTENDEE_MESSAGE) return deliverAttendeeMessage(message);
  if (message.type !== "ORDER_CONFIRMATION" || !message.orderId) {
    throw new Error(`Unsupported outbox message: ${message.type}`);
  }
  const order = await prisma.ticketOrder.findUnique({
    where: { id: message.orderId },
    include: {
      // De banner zoals in de shop (lib/ticketing/poster.ts). De post erbij,
      // want die staat boven de titel in de mail.
      event: {
        include: {
          imageCategory: ticketPosterSelect.imageCategory,
          calendarEvent: ticketPosterSelect.calendarEvent,
          ownerGroup: { select: { nameNl: true, nameEn: true } },
        },
      },
      items: { include: { ticket: true } },
    },
  });
  if (!order || !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status)) {
    throw new Error("Order is not ready for delivery");
  }
  const locale = order.locale === "EN" ? "en" : "nl";
  const access = createOrderAccessToken(order.id, order.accessExpiresAt);
  const prefix = locale === "en" ? "/en" : "";
  const orderUrl = `${ticketingBaseUrl()}${prefix}/tickets/toegang?orderId=${encodeURIComponent(order.id)}#access=${encodeURIComponent(access)}`;
  const { attachments, contents } = await orderMailBundle(order);
  // Een pad volstaat niet in een mailbox: de afbeelding wordt daar buiten de
  // site geladen en heeft dus de volledige URL nodig.
  const posterPath = ticketPosterUrl(order.event);
  const mail = orderConfirmationMail({
    locale,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    eventName: locale === "en" && order.event.titleEn ? order.event.titleEn : order.event.titleNl,
    orderNumber: order.reference,
    ticketCount: order.items.filter((item) => item.ticket).length,
    orderUrl,
    replyTo: order.event.contactEmail,
    contents,
    attachments,
    event: {
      startsAt: order.event.startsAt,
      timeZone: order.event.timeZone,
      location: order.event.location,
      posterUrl: posterPath ? `${ticketingBaseUrl()}${posterPath}` : null,
      ownerName:
        locale === "en" && order.event.ownerGroup.nameEn
          ? order.event.ownerGroup.nameEn
          : order.event.ownerGroup.nameNl,
    },
    summary: {
      lines: orderMailLines(order.items),
      totalCents: order.totalCents,
      refundedCents: order.refundedCents,
      currency: order.currency,
      paidAt: order.paidAt,
    },
  });
  return sendMail(mail);
}

export async function processTicketOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  const workerId = `web-${process.pid}-${randomUUID()}`;
  const messages = await claimMessages(workerId, Math.min(Math.max(limit, 1), 50));
  let sent = 0;
  let failed = 0;

  for (const message of messages) {
    try {
      const providerMessageId = await deliver(message);
      const finalized = await prisma.ticketOutboxMessage.updateMany({
        where: { id: message.id, status: "PROCESSING", lockedBy: workerId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          payload: { providerMessageId },
        },
      });
      if (finalized.count === 1) sent += 1;
    } catch (error) {
      const dead = message.attempts >= 8;
      const delayMinutes = Math.min(360, 2 ** Math.min(message.attempts, 8));
      const finalized = await prisma.ticketOutboxMessage.updateMany({
        where: { id: message.id, status: "PROCESSING", lockedBy: workerId },
        data: {
          status: dead ? "DEAD" : "FAILED",
          availableAt: new Date(Date.now() + delayMinutes * 60_000),
          lockedAt: null,
          lockedBy: null,
          lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error",
        },
      });
      if (finalized.count === 1) failed += 1;
    }
  }
  return { sent, failed };
}
