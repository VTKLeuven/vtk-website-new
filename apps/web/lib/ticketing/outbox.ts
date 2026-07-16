import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@vtk/db";
import { createOrderAccessToken } from "./crypto";
import { orderConfirmationMail, sendMail } from "./mail";
import { ticketingBaseUrl } from "./config";

type ClaimedMessage = {
  id: string;
  type: string;
  orderId: string | null;
  attempts: number;
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
      ORDER BY "availableAt" ASC, "createdAt" ASC
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
    RETURNING message."id", message."type", message."orderId", message."attempts"
  `;
}

async function deliver(message: ClaimedMessage): Promise<string> {
  if (message.type !== "ORDER_CONFIRMATION" || !message.orderId) {
    throw new Error(`Unsupported outbox message: ${message.type}`);
  }
  const order = await prisma.ticketOrder.findUnique({
    where: { id: message.orderId },
    include: { event: true, items: { include: { ticket: true } } },
  });
  if (!order || !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status)) {
    throw new Error("Order is not ready for delivery");
  }
  const locale = order.locale === "EN" ? "en" : "nl";
  const access = createOrderAccessToken(order.id, order.accessExpiresAt);
  const prefix = locale === "en" ? "/en" : "";
  const orderUrl = `${ticketingBaseUrl()}${prefix}/tickets/toegang?orderId=${encodeURIComponent(order.id)}#access=${encodeURIComponent(access)}`;
  const mail = orderConfirmationMail({
    locale,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    eventName: locale === "en" && order.event.titleEn ? order.event.titleEn : order.event.titleNl,
    orderNumber: order.reference,
    ticketCount: order.items.filter((item) => item.ticket).length,
    orderUrl,
    replyTo: order.event.contactEmail,
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
