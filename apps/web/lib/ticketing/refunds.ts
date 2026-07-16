import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@vtk/db";
import { quantitiesByPool, returnSoldInventory } from "./inventory";
import { paymentGatewayFor } from "./payments";
import { withSerializableTransaction } from "./transactions";

export async function requestTicketRefund(input: {
  eventId: string;
  orderId: string;
  orderItemIds: string[];
  requestedById: string;
  reason?: string | null;
}) {
  const selectedIds = new Set(input.orderItemIds);
  const refundId = randomUUID();
  const prepared = await withSerializableTransaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TicketOrder" WHERE "id" = ${input.orderId} FOR UPDATE`;
      const order = await tx.ticketOrder.findUnique({
        where: { id: input.orderId },
        include: {
          items: { include: { ticket: true } },
          payments: {
            where: { status: "SUCCEEDED" },
            orderBy: { succeededAt: "desc" },
          },
        },
      });
      if (!order || order.eventId !== input.eventId) throw new Error("ORDER_NOT_FOUND");
      const payment = order.payments[0];
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      const items = order.items.filter((item) => selectedIds.has(item.id));
      if (items.length === 0 || items.length !== selectedIds.size) {
        throw new Error("INVALID_REFUND_ITEMS");
      }
      if (items.some((item) => !item.ticket || item.ticket.status !== "VALID")) {
        throw new Error("TICKET_NOT_REFUNDABLE");
      }
      if (items.some((item) => item.ticket?.checkedInAt)) {
        throw new Error("TICKET_ALREADY_CHECKED_IN");
      }
      const existingRefund = await tx.ticketRefundItem.count({
        where: {
          orderItemId: { in: items.map((item) => item.id) },
          refund: { status: { in: ["PENDING", "SUCCEEDED"] } },
        },
      });
      if (existingRefund > 0) throw new Error("REFUND_ALREADY_REQUESTED");

      const amountCents = items.reduce((sum, item) => sum + item.totalCents, 0);
      if (!payment.providerPaymentId && amountCents > 0) {
        throw new Error("PAYMENT_REFERENCE_MISSING");
      }
      for (const item of items) {
        const changed = await tx.$executeRaw`
          UPDATE "Ticket"
          SET "status" = 'VOID'::"TicketStatus", "voidedAt" = NOW()
          WHERE "id" = ${item.ticket!.id}
            AND "eventId" = ${order.eventId}
            AND "status" = 'VALID'::"TicketStatus"
            AND "checkedInAt" IS NULL
        `;
        if (changed !== 1) throw new Error("TICKET_NOT_REFUNDABLE");
      }
      await tx.ticketRefund.create({
        data: {
          id: refundId,
          orderId: order.id,
          paymentId: payment.id,
          provider: payment.provider,
          idempotencyKey: refundId,
          amountCents,
          currency: order.currency,
          reason: input.reason?.trim() || null,
          requestedById: input.requestedById,
          items: {
            create: items.map((item) => ({
              orderItemId: item.id,
              amountCents: item.totalCents,
            })),
          },
        },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId: order.eventId,
          actorUserId: input.requestedById,
          action: "REFUND_REQUESTED",
          entityType: "TicketRefund",
          entityId: refundId,
          metadata: { orderId: order.id, amountCents, ticketCount: items.length },
        },
      });
      return {
        amountCents,
        currency: order.currency,
        orderId: order.id,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
      };
    }
  );

  if (prepared.amountCents === 0 || prepared.provider === "free") {
    await completeTicketRefund(refundId, `free_refund_${refundId}`);
    return { refundId, status: "SUCCEEDED" as const };
  }

  try {
    const result = await paymentGatewayFor(prepared.provider).refund({
      paymentId: prepared.providerPaymentId!,
      amountCents: prepared.amountCents,
      currency: prepared.currency,
      orderId: prepared.orderId,
      refundId,
      reason: input.reason,
    });
    if (result.status === "SUCCEEDED") {
      await completeTicketRefund(refundId, result.providerRefundId);
    } else if (result.status === "FAILED") {
      await failTicketRefund(refundId, result.providerRefundId);
    } else {
      await prisma.ticketRefund.updateMany({
        where: { id: refundId, status: "PENDING", completedAt: null },
        data: {
          providerRefundId: result.providerRefundId,
          status: result.status,
        },
      });
    }
    return { refundId, status: result.status };
  } catch (error) {
    // Keep this pending: retrying with the same provider idempotency key is safe.
    throw error;
  }
}

export async function failTicketRefund(refundId: string, providerRefundId?: string | null) {
  return withSerializableTransaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ orderId: string }>>`
        SELECT "orderId" FROM "TicketRefund" WHERE "id" = ${refundId} FOR UPDATE
      `;
      if (!locked[0]) throw new Error("REFUND_NOT_FOUND");
      const refund = await tx.ticketRefund.findUnique({
        where: { id: refundId },
        include: { order: true, items: { include: { orderItem: { include: { ticket: true } } } } },
      });
      if (!refund) throw new Error("REFUND_NOT_FOUND");
      if (refund.status === "SUCCEEDED") return refund;

      const ticketIds = refund.items.flatMap((item) =>
        item.orderItem.ticket?.status === "VOID" ? [item.orderItem.ticket.id] : []
      );
      if (ticketIds.length) {
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds }, eventId: refund.order.eventId, status: "VOID" },
          data: { status: "VALID", voidedAt: null },
        });
      }
      const updated = await tx.ticketRefund.update({
        where: { id: refund.id },
        data: { status: "FAILED", providerRefundId: providerRefundId ?? refund.providerRefundId },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId: refund.order.eventId,
          actorUserId: refund.requestedById,
          action: "REFUND_FAILED",
          entityType: "TicketRefund",
          entityId: refund.id,
          metadata: { orderId: refund.orderId, amountCents: refund.amountCents },
        },
      });
      return updated;
    }
  );
}

export async function completeTicketRefund(refundId: string, providerRefundId?: string | null) {
  return withSerializableTransaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ orderId: string }>>`
        SELECT "orderId" FROM "TicketRefund" WHERE "id" = ${refundId} FOR UPDATE
      `;
      if (!locked[0]) throw new Error("REFUND_NOT_FOUND");
      await tx.$queryRaw`
        SELECT "id" FROM "TicketOrder" WHERE "id" = ${locked[0].orderId} FOR UPDATE
      `;
      const refund = await tx.ticketRefund.findUnique({
        where: { id: refundId },
        include: {
          order: true,
          items: { include: { orderItem: { include: { ticket: true } } } },
        },
      });
      if (!refund) throw new Error("REFUND_NOT_FOUND");
      if (refund.completedAt) return refund;

      const refundableItems = refund.items.filter(
        (item) => item.orderItem.ticket?.status === "VOID" || item.orderItem.ticket?.status === "VALID"
      );
      if (refundableItems.length !== refund.items.length) {
        throw new Error("REFUND_TICKET_STATE_MISMATCH");
      }
      if (refundableItems.length > 0) {
        await returnSoldInventory(
          tx,
          refund.order.eventId,
          quantitiesByPool(refundableItems.map((item) => item.orderItem))
        );
        await tx.ticket.updateMany({
          where: { id: { in: refundableItems.map((item) => item.orderItem.ticket!.id) } },
          data: {
            status: "REFUNDED",
            refundedAt: new Date(),
            voidedAt: null,
            checkedInAt: null,
            checkedInById: null,
          },
        });
      }

      const refundedCents = Math.min(
        refund.order.totalCents,
        refund.order.refundedCents + refund.amountCents
      );
      await tx.ticketOrder.update({
        where: { id: refund.orderId },
        data: {
          refundedCents,
          status: refundedCents >= refund.order.totalCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
      const updated = await tx.ticketRefund.update({
        where: { id: refund.id },
        data: {
          status: "SUCCEEDED",
          providerRefundId: providerRefundId ?? refund.providerRefundId,
          completedAt: new Date(),
        },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId: refund.order.eventId,
          actorUserId: refund.requestedById,
          action: "REFUND_SUCCEEDED",
          entityType: "TicketRefund",
          entityId: refund.id,
          metadata: { orderId: refund.orderId, amountCents: refund.amountCents },
        },
      });
      return updated;
    }
  );
}
