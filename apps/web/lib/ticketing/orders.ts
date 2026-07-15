import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, TicketQuestion as TicketQuestionModel } from "@prisma/client";
import { headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { reservationMinutes, ticketingBaseUrl } from "./config";
import {
  createOrderAccessToken,
  createOrderNumber,
  createPublicTicketId,
  createTicketCredential,
  secureTokenHash,
} from "./crypto";
import {
  commitReservedInventory,
  quantitiesByPool,
  releaseReservedInventory,
  reserveInventory,
} from "./inventory";
import { paymentGateway, paymentGatewayFor, type CheckoutResult } from "./payments";
import { orderAccessExpiry } from "./access";
import { withSerializableTransaction } from "./transactions";

const answerValueSchema = z.union([
  z.string().max(2_000),
  z.boolean(),
  z.array(z.string().max(300)).max(30),
]);

export const checkoutRequestSchema = z.object({
  eventId: z.string().min(1),
  buyerName: z.string().trim().min(2).max(160),
  buyerEmail: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  locale: z.enum(["nl", "en"]).default("nl"),
  termsAccepted: z.literal(true),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        attendeeName: z.string().trim().min(2).max(160),
        attendeeEmail: z
          .union([z.string().trim().email().max(320), z.literal("")])
          .optional()
          .transform((value) => value || null),
        answers: z.record(answerValueSchema).default({}),
      })
    )
    .min(1)
    .max(50),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export class TicketCheckoutError extends Error {
  constructor(
    public readonly code:
      | "EVENT_NOT_ON_SALE"
      | "INVALID_TICKET_TYPE"
      | "LOGIN_REQUIRED"
      | "INVALID_QUANTITY"
      | "INVALID_ANSWER"
      | "TOO_MANY_RESERVATIONS"
      | "FREE_TICKET_LIMIT"
      | "SOLD_OUT"
      | "PAYMENT_UNAVAILABLE",
    public readonly field?: string
  ) {
    super(code);
    this.name = "TicketCheckoutError";
  }
}

function isWithinWindow(now: Date, start: Date | null, end: Date | null): boolean {
  return (!start || start <= now) && (!end || end > now);
}

function validateAnswer(
  question: Pick<TicketQuestionModel, "required" | "type" | "options">,
  value: unknown
): boolean {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return !question.required;
  }
  if (question.type === "BOOLEAN") return typeof value === "boolean";
  if (question.type === "MULTIPLE_CHOICE") {
    if (!Array.isArray(value)) return false;
    const options = Array.isArray(question.options) ? question.options : [];
    return value.every((entry) => typeof entry === "string" && options.includes(entry));
  }
  if (question.type === "SINGLE_CHOICE") {
    const options = Array.isArray(question.options) ? question.options : [];
    return typeof value === "string" && options.includes(value);
  }
  return typeof value === "string" && value.trim().length > 0;
}

function localOrderUrl(locale: "nl" | "en", orderId: string): string {
  const prefix = locale === "en" ? "/en" : "";
  return `${ticketingBaseUrl()}${prefix}/tickets/bestelling/${orderId}`;
}

export async function createTicketCheckout(
  rawInput: unknown,
  requestFingerprint: string | null
): Promise<{
  orderId: string;
  orderNumber: string;
  access: string;
  accessExpiresAt: Date;
  checkoutUrl: string;
}> {
  const input = checkoutRequestSchema.parse(rawInput);
  const now = new Date();
  const session = await getSession(await headers());

  const event = await prisma.ticketEvent.findUnique({
    where: { id: input.eventId },
    include: {
      ticketTypes: {
        include: { inventoryPool: true },
      },
      questions: { where: { active: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (
    !event ||
    event.status !== "PUBLISHED" ||
    !isWithinWindow(now, event.salesStartAt, event.salesEndAt)
  ) {
    throw new TicketCheckoutError("EVENT_NOT_ON_SALE");
  }
  if (input.items.length > event.maxTicketsPerOrder) {
    throw new TicketCheckoutError("INVALID_QUANTITY", "items");
  }

  const typeById = new Map(event.ticketTypes.map((type) => [type.id, type]));
  const countByType = new Map<string, number>();
  const normalizedItems = input.items.map((item) => {
    const type = typeById.get(item.ticketTypeId);
    if (!type || !type.active || !isWithinWindow(now, type.salesStartAt, type.salesEndAt)) {
      throw new TicketCheckoutError("INVALID_TICKET_TYPE", item.ticketTypeId);
    }
    if (type.audience === "MEMBERS" && !session) {
      throw new TicketCheckoutError("LOGIN_REQUIRED", item.ticketTypeId);
    }
    if (type.unitPriceCents === 0 && !session) {
      throw new TicketCheckoutError("LOGIN_REQUIRED", item.ticketTypeId);
    }
    countByType.set(type.id, (countByType.get(type.id) ?? 0) + 1);

    const questions = event.questions.filter(
      (question) => question.ticketTypeId == null || question.ticketTypeId === type.id
    );
    const answers = questions.flatMap((question) => {
      const value = item.answers[question.code] ?? item.answers[question.id];
      if (!validateAnswer(question, value)) {
        throw new TicketCheckoutError("INVALID_ANSWER", question.code);
      }
      if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
        return [];
      }
      return [{
          eventId: event.id,
          questionId: question.id,
          questionCode: question.code,
          questionLabel: question.labelNl,
          value: value as Prisma.InputJsonValue,
        }];
    });

    return {
      eventId: event.id,
      ticketTypeId: type.id,
      inventoryPoolId: type.inventoryPoolId,
      ticketTypeCode: type.code,
      ticketTypeName: input.locale === "en" && type.nameEn ? type.nameEn : type.nameNl,
      unitPriceCents: type.unitPriceCents,
      discountCents: 0,
      totalCents: type.unitPriceCents,
      attendeeName: item.attendeeName,
      attendeeEmail: item.attendeeEmail?.toLowerCase() ?? null,
      answers,
    };
  });

  for (const [typeId, count] of countByType) {
    const type = typeById.get(typeId)!;
    if (count < type.minPerOrder || count > type.maxPerOrder) {
      throw new TicketCheckoutError("INVALID_QUANTITY", typeId);
    }
  }

  const pendingSince = new Date(now.getTime() - 60 * 60 * 1000);
  const abuseFilters: Prisma.TicketOrderWhereInput[] = [
    { buyerEmail: input.buyerEmail },
    ...(requestFingerprint ? [{ requestFingerprint }] : []),
  ];
  const orderId = randomUUID();
  const accessExpiresAt = orderAccessExpiry(event.endsAt, now);
  const access = createOrderAccessToken(orderId, accessExpiresAt);
  const orderNumber = createOrderNumber(now);
  const expiresAt = new Date(now.getTime() + reservationMinutes() * 60_000);
  const totalCents = normalizedItems.reduce((sum, item) => sum + item.totalCents, 0);
  if (totalCents === 0 && !session) {
    throw new TicketCheckoutError("LOGIN_REQUIRED");
  }
  const poolQuantities = quantitiesByPool(normalizedItems);

  try {
    await withSerializableTransaction(
      async (tx) => {
        const lockKeys = [
          `ticket-checkout:email:${event.id}:${input.buyerEmail}`,
          ...(requestFingerprint
            ? [`ticket-checkout:fingerprint:${event.id}:${requestFingerprint}`]
            : []),
          ...(session
            ? [`ticket-checkout:user:${event.id}:${session.user.id}`]
            : []),
        ].sort();
        for (const lockKey of lockKeys) {
          await tx.$queryRaw<Array<{ locked: number }>>`
            SELECT 1::integer AS "locked"
            FROM (
              SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS value
            ) AS acquired
          `;
        }
        const recentPending = await tx.ticketOrder.count({
          where: {
            eventId: event.id,
            createdAt: { gte: pendingSince },
            status: "PENDING_PAYMENT",
            reservationExpiresAt: { gt: now },
            OR: abuseFilters,
          },
        });
        if (recentPending >= 3) {
          throw new TicketCheckoutError("TOO_MANY_RESERVATIONS");
        }
        if (totalCents === 0 && session) {
          const validFreeTickets = await tx.ticket.count({
            where: {
              eventId: event.id,
              status: "VALID",
              orderItem: {
                order: {
                  buyerUserId: session.user.id,
                  totalCents: 0,
                },
              },
            },
          });
          if (validFreeTickets + normalizedItems.length > event.maxTicketsPerOrder) {
            throw new TicketCheckoutError("FREE_TICKET_LIMIT");
          }
        }

        await reserveInventory(tx, event.id, poolQuantities);
        await tx.ticketOrder.create({
          data: {
            id: orderId,
            eventId: event.id,
            reference: orderNumber,
            accessTokenHash: secureTokenHash(access),
            accessExpiresAt,
            requestFingerprint,
            buyerUserId: session?.user.id ?? null,
            buyerName: input.buyerName,
            buyerEmail: input.buyerEmail,
            locale: input.locale === "en" ? "EN" : "NL",
            currency: event.currency,
            subtotalCents: totalCents,
            totalCents,
            reservationExpiresAt: expiresAt,
            termsAcceptedAt: now,
            termsVersion: event.termsVersion,
            items: {
              create: normalizedItems.map((item) => ({
                ticketTypeId: item.ticketTypeId,
                inventoryPoolId: item.inventoryPoolId,
                ticketTypeCode: item.ticketTypeCode,
                ticketTypeName: item.ticketTypeName,
                unitPriceCents: item.unitPriceCents,
                discountCents: item.discountCents,
                totalCents: item.totalCents,
                attendeeName: item.attendeeName,
                attendeeEmail: item.attendeeEmail,
                answers: { create: item.answers },
              })),
            },
          },
        });
        await tx.ticketAuditLog.create({
          data: {
            eventId: event.id,
            actorUserId: session?.user.id ?? null,
            action: "ORDER_CREATED",
            entityType: "TicketOrder",
            entityId: orderId,
            metadata: { orderNumber, ticketCount: normalizedItems.length },
          },
        });
      }
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "SOLD_OUT") {
      throw new TicketCheckoutError("SOLD_OUT");
    }
    throw error;
  }

  const paymentId = randomUUID();
  if (totalCents === 0) {
    await withSerializableTransaction(
      async (tx) => {
        await tx.ticketPayment.create({
          data: {
            id: paymentId,
            orderId,
            provider: "free",
            idempotencyKey: `${orderId}:1`,
            status: "CREATED",
            amountCents: 0,
            currency: event.currency,
            expiresAt,
          },
        });
        await fulfillPaidOrderWithTx(tx, {
          orderId,
          provider: "free",
          providerPaymentId: `free_${orderId}`,
          amountCents: 0,
          currency: event.currency,
        });
      }
    );
    return {
      orderId,
      orderNumber,
      access,
      accessExpiresAt,
      checkoutUrl: localOrderUrl(input.locale, orderId),
    };
  }

  const provider = paymentGateway().name;
  await prisma.ticketPayment.create({
    data: {
      id: paymentId,
      orderId,
      provider,
      idempotencyKey: `${orderId}:1`,
      status: "CREATED",
      amountCents: totalCents,
      currency: event.currency,
      expiresAt,
    },
  });

  const returnUrl = localOrderUrl(input.locale, orderId);
  const gateway = paymentGateway();
  const checkoutInput = {
      orderId,
      orderNumber,
      buyerEmail: input.buyerEmail,
      eventName: input.locale === "en" && event.titleEn ? event.titleEn : event.titleNl,
      currency: event.currency,
      lines: [...countByType].map(([typeId, quantity]) => {
        const type = typeById.get(typeId)!;
        return {
          name: input.locale === "en" && type.nameEn ? type.nameEn : type.nameNl,
          description: input.locale === "en" ? type.descriptionEn : type.descriptionNl,
          quantity,
          unitAmountCents: type.unitPriceCents,
        };
      }),
      expiresAt,
      successUrl: `${returnUrl}?payment=return`,
      cancelUrl: `${returnUrl}?payment=cancelled`,
      attempt: 1,
    };
  let checkout: CheckoutResult | null = null;
  let checkoutError: unknown;
  for (let attempt = 0; attempt < 3 && !checkout; attempt += 1) {
    try {
      checkout = await gateway.createCheckout(checkoutInput);
    } catch (error) {
      checkoutError = error;
      if (gateway.isDefinitiveCheckoutError(error)) {
        await failPendingOrder(orderId, paymentId);
        throw new TicketCheckoutError("PAYMENT_UNAVAILABLE");
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
      }
    }
  }
  if (!checkout) {
    await prisma.ticketPayment.updateMany({
      where: { id: paymentId, status: "CREATED" },
      data: { providerStatus: "checkout_creation_uncertain" },
    });
    console.error("Ticket checkout creation remained uncertain after retries", {
      orderId,
      error: checkoutError,
    });
    throw new TicketCheckoutError("PAYMENT_UNAVAILABLE");
  }

  let checkoutPersisted = false;
  let checkoutPersistenceError: unknown;
  for (let attempt = 1; attempt <= 3 && !checkoutPersisted; attempt += 1) {
    try {
      await prisma.ticketPayment.update({
        where: { id: paymentId },
        data: {
          status: "PENDING",
          providerCheckoutId: checkout.checkoutId,
          providerPaymentId: checkout.paymentId,
          checkoutUrl: checkout.url,
        },
      });
      checkoutPersisted = true;
    } catch (error) {
      checkoutPersistenceError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      }
    }
  }
  if (!checkoutPersisted) {
    // Never expose a provider URL that cannot be reconciled locally. Keep the
    // reservation pending so a concurrent provider webhook can still fulfill it.
    try {
      await gateway.expireCheckout(checkout.checkoutId);
    } catch (expiryError) {
      console.error("Unable to expire unpersisted ticket checkout", { orderId, expiryError });
    }
    console.error("Ticket checkout created but local payment update failed", {
      orderId,
      error: checkoutPersistenceError,
    });
    throw new TicketCheckoutError("PAYMENT_UNAVAILABLE");
  }
  if (checkout.status === "SUCCEEDED") {
    try {
      await fulfillPaidOrder({
        orderId,
        provider: checkout.provider,
        providerPaymentId: checkout.paymentId ?? checkout.checkoutId,
        providerCheckoutId: checkout.checkoutId,
        amountCents: totalCents,
        currency: event.currency,
      });
    } catch (error) {
      console.error("Immediate ticket fulfillment failed; webhook will retry", { orderId, error });
    }
  }
  return { orderId, orderNumber, access, accessExpiresAt, checkoutUrl: checkout.url };
}

type FulfillPaidOrderInput = {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  providerCheckoutId?: string | null;
  amountCents: number;
  currency: string;
};

async function fulfillPaidOrderWithTx(
  tx: Prisma.TransactionClient,
  input: FulfillPaidOrderInput
) {
      const order = await tx.ticketOrder.findUnique({
        where: { id: input.orderId },
        include: { items: { include: { ticket: true } }, payments: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" || order.status === "REFUNDED") {
        return order;
      }
      if (order.status !== "PENDING_PAYMENT") throw new Error("ORDER_NOT_PAYABLE");
      if (order.totalCents !== input.amountCents || order.currency !== input.currency.toUpperCase()) {
        throw new Error("PAYMENT_AMOUNT_MISMATCH");
      }

      const payment = order.payments.find(
        (candidate) =>
          candidate.provider === input.provider &&
          (candidate.providerCheckoutId === input.providerCheckoutId ||
            candidate.providerCheckoutId == null ||
            !input.providerCheckoutId)
      );
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      await commitReservedInventory(tx, order.eventId, quantitiesByPool(order.items));
      for (const item of order.items) {
        if (item.ticket) continue;
        const publicCode = createPublicTicketId();
        const credential = createTicketCredential(publicCode, 1);
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            orderItemId: item.id,
            publicCode,
            credentialHash: secureTokenHash(credential),
            credentialVersion: 1,
          },
        });
      }
      await tx.ticketPayment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: input.providerPaymentId,
          providerCheckoutId: input.providerCheckoutId ?? payment.providerCheckoutId,
          status: "SUCCEEDED",
          succeededAt: new Date(),
          providerStatus: "paid",
        },
      });
      const updated = await tx.ticketOrder.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date(), reservationExpiresAt: null },
      });
      await tx.ticketOutboxMessage.upsert({
        where: { dedupeKey: `order-confirmation:${order.id}` },
        update: {},
        create: {
          eventId: order.eventId,
          orderId: order.id,
          type: "ORDER_CONFIRMATION",
          dedupeKey: `order-confirmation:${order.id}`,
          recipient: order.buyerEmail,
          payload: { orderId: order.id },
        },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId: order.eventId,
          action: "ORDER_PAID",
          entityType: "TicketOrder",
          entityId: order.id,
          metadata: { provider: input.provider, amountCents: input.amountCents },
        },
      });
      return updated;
}

export async function fulfillPaidOrder(input: FulfillPaidOrderInput) {
  return withSerializableTransaction((tx) => fulfillPaidOrderWithTx(tx, input));
}

async function failPendingOrder(orderId: string, paymentId: string) {
  await withSerializableTransaction(
    async (tx) => {
      const order = await tx.ticketOrder.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || order.status !== "PENDING_PAYMENT") return;
      await releaseReservedInventory(tx, order.eventId, quantitiesByPool(order.items));
      await tx.ticketOrder.update({
        where: { id: order.id },
        data: { status: "PAYMENT_FAILED", failedAt: new Date(), reservationExpiresAt: null },
      });
      await tx.ticketPayment.update({
        where: { id: paymentId },
        data: { status: "FAILED", failedAt: new Date() },
      });
    }
  );
}

export async function expirePendingOrder(orderId: string): Promise<boolean> {
  return withSerializableTransaction(
    async (tx) => {
      const order = await tx.ticketOrder.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || order.status !== "PENDING_PAYMENT") return false;
      await releaseReservedInventory(tx, order.eventId, quantitiesByPool(order.items));
      await tx.ticketOrder.update({
        where: { id: order.id },
        data: { status: "EXPIRED", expiredAt: new Date(), reservationExpiresAt: null },
      });
      await tx.ticketPayment.updateMany({
        where: { orderId: order.id, status: { in: ["CREATED", "PENDING"] } },
        data: { status: "EXPIRED" },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId: order.eventId,
          action: "ORDER_EXPIRED",
          entityType: "TicketOrder",
          entityId: order.id,
        },
      });
      return true;
    }
  );
}

export async function releaseExpiredOrders(limit = 100): Promise<number> {
  const orders = await prisma.ticketOrder.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lte: new Date() } },
    select: {
      id: true,
      totalCents: true,
      currency: true,
      payments: {
        where: { status: { in: ["CREATED", "PENDING"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { provider: true, providerCheckoutId: true },
      },
    },
    take: limit,
    orderBy: { reservationExpiresAt: "asc" },
  });

  let released = 0;
  for (const order of orders) {
    const payment = order.payments[0];
    const checkoutId = payment?.providerCheckoutId;
    if (checkoutId && payment.provider !== "mock") {
      try {
        const gateway = paymentGatewayFor(payment.provider);
        let status = await gateway.getCheckoutStatus(checkoutId);
        if (status.status === "PENDING") {
          try {
            await gateway.expireCheckout(checkoutId);
          } catch {
            // A payment can complete between the status check and expiry request.
          }
          status = await gateway.getCheckoutStatus(checkoutId);
        }
        if (status.status === "SUCCEEDED") {
          if (
            status.orderId !== order.id ||
            status.amountCents !== order.totalCents ||
            status.currency !== order.currency ||
            !status.paymentId
          ) {
            throw new Error("EXPIRY_RECONCILIATION_MISMATCH");
          }
          await fulfillPaidOrder({
            orderId: order.id,
            provider: payment.provider,
            providerPaymentId: status.paymentId,
            providerCheckoutId: status.checkoutId,
            amountCents: status.amountCents,
            currency: status.currency,
          });
          continue;
        }
        if (status.status === "PENDING") continue;
      } catch (error) {
        console.error("Unable to safely expire checkout session", { orderId: order.id, error });
        continue;
      }
    }
    if (await expirePendingOrder(order.id)) released += 1;
  }
  return released;
}
