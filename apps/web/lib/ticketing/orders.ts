import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, TicketQuestion as TicketQuestionModel } from "@prisma/client";
import { headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { z } from "zod";
import {
  enabledPaymentMethods,
  reservationMinutes,
  ticketingBaseUrl,
  type PaymentProviderName,
} from "./config";
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
import {
  paymentGatewayFor,
  type CheckoutLine,
  type CheckoutResult,
} from "./payments";
import { orderAccessExpiry } from "./access";
import { withSerializableTransaction } from "./transactions";
import { publishedTicketDesign } from "./design";
import { getTicketTerms } from "./terms";

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
  paymentProvider: z.enum(["bancontact", "mollie", "mock"]).optional(),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        attendeeName: z.string().trim().min(2).max(160),
        attendeeEmail: z
          .union([z.string().trim().email().max(320), z.literal("")])
          .optional()
          .transform((value) => value || null),
        answers: z.record(z.string(), answerValueSchema).default({}),
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

/**
 * Het r-nummer dat aan dit ticket mag hangen, of null.
 *
 * Enkel voor een event met `cardCheckIn`, en enkel het nummer van de **ingelogde
 * koper**: dat is wat we zeker weten. Wie voor vier man bestelt, krijgt dus één
 * ticket met kaartcheck-in; de andere drie gaan met hun QR of via de naamlijst
 * binnen, of een beheerder vult hun nummer achteraf aan op de deelnemerspagina.
 *
 * Heeft de koper al een ticket voor dit event, dan blijft het nieuwe leeg in
 * plaats van te botsen op de unieke index: een tweede bestelling is er per
 * definitie voor iemand anders, en een aankoop mag daar nooit op afspringen.
 */
async function buyerRNumberForCheckout(
  eventId: string,
  cardCheckIn: boolean,
  userId: string | undefined,
): Promise<string | null> {
  if (!cardCheckIn || !userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { rNumber: true } });
  const rNumber = user?.rNumber?.trim().toLowerCase();
  if (!rNumber) return null;
  const taken = await prisma.ticketOrderItem.count({ where: { eventId, rNumber } });
  return taken > 0 ? null : rNumber;
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
  const methods = enabledPaymentMethods();
  if (input.paymentProvider && !methods.includes(input.paymentProvider)) {
    // De knop komt van dezelfde `enabledPaymentMethods()`, dus dit betekent dat
    // de browser een oudere pagina toont dan de server draait. Zonder deze
    // regel is dat niet te onderscheiden van een provider die weigert: de koper
    // ziet in beide gevallen dezelfde melding.
    console.error("Ticket checkout asked for a payment method that is not enabled", {
      requested: input.paymentProvider,
      enabled: methods,
    });
    throw new TicketCheckoutError("PAYMENT_UNAVAILABLE");
  }
  const now = new Date();
  const [session, terms] = await Promise.all([getSession(await headers()), getTicketTerms()]);
  // Erelidtickets staan bij niemand anders in de lijst (zie ticketing/queries.ts);
  // deze controle is het slot erachter.
  const isHonorary = session
    ? ((
        await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { honoraryMember: true },
        })
      )?.honoraryMember ?? false)
    : false;

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
    // Een erelidticket staat bij niemand anders in de lijst; wie het toch
    // meestuurt, krijgt hetzelfde antwoord als bij een onbestaand type.
    if (type.audience === "HONORARY" && !isHonorary) {
      throw new TicketCheckoutError("INVALID_TICKET_TYPE", item.ticketTypeId);
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

  // Enkel de eerste bestelregel draagt het r-nummer: het is dat van de koper, en
  // een r-nummer kan per event maar aan één ticket hangen.
  const buyerRNumber = await buyerRNumberForCheckout(event.id, event.cardCheckIn, session?.user.id);

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
            termsVersion: terms.version,
            items: {
              create: normalizedItems.map((item, index) => ({
                ticketTypeId: item.ticketTypeId,
                inventoryPoolId: item.inventoryPoolId,
                ticketTypeCode: item.ticketTypeCode,
                ticketTypeName: item.ticketTypeName,
                unitPriceCents: item.unitPriceCents,
                discountCents: item.discountCents,
                totalCents: item.totalCents,
                attendeeName: item.attendeeName,
                attendeeEmail: item.attendeeEmail,
                rNumber: index === 0 ? buyerRNumber : null,
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

  // The shop sends its selected provider. Older clients without a choice can
  // still select one on the order page when multiple providers are enabled.
  if (!input.paymentProvider && methods.length > 1) {
    return {
      orderId,
      orderNumber,
      access,
      accessExpiresAt,
      checkoutUrl: localOrderUrl(input.locale, orderId),
    };
  }

  const context: CheckoutContext = {
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
    locale: input.locale,
    totalCents,
  };

  let checkout: CheckoutResult;
  try {
    checkout = await createAndPersistCheckout(context, input.paymentProvider ?? methods[0]!, 1, paymentId);
  } catch (error) {
    if (error instanceof CheckoutCreationError) {
      if (error.definitive) await failPendingOrder(orderId, paymentId);
      throw new TicketCheckoutError("PAYMENT_UNAVAILABLE");
    }
    throw error;
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

/** Wat een gateway nodig heeft om een checkout te maken voor een bestaande bestelling. */
type CheckoutContext = {
  orderId: string;
  orderNumber: string;
  buyerEmail: string;
  eventName: string;
  currency: string;
  lines: CheckoutLine[];
  expiresAt: Date;
  locale: "nl" | "en";
  totalCents: number;
};

/**
 * Een mislukte checkoutaanmaak. `definitive` betekent: opnieuw proberen met
 * dezelfde gegevens heeft geen zin. Wat er dan met de bestelling moet gebeuren,
 * verschilt per aanroeper, en staat daarom niet hier: bij een eerste aankoop
 * valt de bestelling af, bij een tweede poging blijft ze staan zodat de koper
 * de andere betaalwijze nog kan kiezen.
 */
class CheckoutCreationError extends Error {
  constructor(
    readonly definitive: boolean,
    readonly paymentId: string,
    readonly cause?: unknown
  ) {
    super("CHECKOUT_CREATION_FAILED");
    this.name = "CheckoutCreationError";
  }
}

/**
 * Maakt de payment-rij, vraagt de provider een checkout en legt het resultaat
 * vast. Gedeeld door de eerste aankoop en door elke volgende poging met een
 * andere betaalwijze.
 */
async function createAndPersistCheckout(
  context: CheckoutContext,
  provider: PaymentProviderName,
  attempt: number,
  paymentId: string = randomUUID()
): Promise<CheckoutResult> {
  await prisma.ticketPayment.create({
    data: {
      id: paymentId,
      orderId: context.orderId,
      provider,
      idempotencyKey: `${context.orderId}:${attempt}`,
      status: "CREATED",
      amountCents: context.totalCents,
      currency: context.currency,
      expiresAt: context.expiresAt,
    },
  });

  const returnUrl = localOrderUrl(context.locale, context.orderId);
  const gateway = paymentGatewayFor(provider);
  const checkoutInput = {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    buyerEmail: context.buyerEmail,
    eventName: context.eventName,
    currency: context.currency,
    lines: context.lines,
    expiresAt: context.expiresAt,
    successUrl: `${returnUrl}?payment=return`,
    cancelUrl: `${returnUrl}?payment=cancelled`,
    attempt,
  };

  let checkout: CheckoutResult | null = null;
  let checkoutError: unknown;
  for (let retry = 0; retry < 3 && !checkout; retry += 1) {
    try {
      checkout = await gateway.createCheckout(checkoutInput);
    } catch (error) {
      checkoutError = error;
      if (gateway.isDefinitiveCheckoutError(error)) {
        // Dit is de enige weg waarlangs een koper "de betaalpagina is tijdelijk
        // niet bereikbaar" te zien kreeg zonder dat er iets in de logs stond:
        // een definitieve fout wordt niet opnieuw geprobeerd, en werd dus ook
        // niet gelogd zoals de onzekere fout hieronder wel. Wat de provider
        // precies weigert (foutcode, veld, traceId) staat in `error`.
        console.error("Ticket checkout refused by the payment provider", {
          orderId: context.orderId,
          provider,
          attempt,
          error,
        });
        throw new CheckoutCreationError(true, paymentId, error);
      }
      if (retry < 2) {
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** retry));
      }
    }
  }
  if (!checkout) {
    await prisma.ticketPayment.updateMany({
      where: { id: paymentId, status: "CREATED" },
      data: { providerStatus: "checkout_creation_uncertain" },
    });
    console.error("Ticket checkout creation remained uncertain after retries", {
      orderId: context.orderId,
      provider,
      error: checkoutError,
    });
    throw new CheckoutCreationError(false, paymentId, checkoutError);
  }

  let checkoutPersisted = false;
  let checkoutPersistenceError: unknown;
  for (let retry = 1; retry <= 3 && !checkoutPersisted; retry += 1) {
    try {
      await prisma.ticketPayment.update({
        where: { id: paymentId },
        data: {
          status: "PENDING",
          providerCheckoutId: checkout.checkoutId,
          providerPaymentId: checkout.paymentId,
          checkoutUrl: checkout.url,
          providerDeeplink: checkout.deeplinkUrl ?? null,
          providerQrCodeUrl: checkout.qrCodeUrl ?? null,
          // Zegt de provider wanneer zijn checkout vervalt, dan wint dat van de
          // reservatie: dit veld gaat over deze betaalpoging en niet over hoe
          // lang de tickets vasthangen. De betaalpagina leest het.
          ...(checkout.expiresAt ? { expiresAt: checkout.expiresAt } : {}),
        },
      });
      checkoutPersisted = true;
    } catch (error) {
      checkoutPersistenceError = error;
      if (retry < 3) {
        await new Promise((resolve) => setTimeout(resolve, 100 * retry));
      }
    }
  }
  if (!checkoutPersisted) {
    // Never expose a provider URL that cannot be reconciled locally. Keep the
    // reservation pending so a concurrent provider webhook can still fulfill it.
    try {
      await gateway.expireCheckout(checkout.checkoutId);
    } catch (expiryError) {
      console.error("Unable to expire unpersisted ticket checkout", {
        orderId: context.orderId,
        expiryError,
      });
    }
    console.error("Ticket checkout created but local payment update failed", {
      orderId: context.orderId,
      error: checkoutPersistenceError,
    });
    throw new CheckoutCreationError(false, paymentId, checkoutPersistenceError);
  }
  return checkout;
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
      // Resolve once inside the fulfilment transaction. Every ticket in this
      // order gets the same immutable published layout, even if an admin edits
      // the next draft while payment is being processed.
      const eventDesign = await tx.ticketEvent.findUnique({
        where: { id: order.eventId },
        select: { settings: true },
      });
      if (!eventDesign) throw new Error("EVENT_NOT_FOUND");
      const designSnapshot = publishedTicketDesign(eventDesign.settings, order.eventId);
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
            designSnapshot,
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

export type StartPaymentCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PAYABLE"
  | "ALREADY_PAID"
  | "RESERVATION_EXPIRED"
  | "METHOD_UNAVAILABLE"
  | "PAYMENT_PENDING_ELSEWHERE"
  | "PAYMENT_UNAVAILABLE";

export type StartPaymentResult =
  | { ok: true; provider: PaymentProviderName; checkoutUrl: string }
  | { ok: false; code: StartPaymentCode };

/**
 * Sluit elke nog levende checkout van deze bestelling af.
 *
 * Dit is de kern van "kiezen tussen twee betaalwijzen": zonder dit kan een
 * koper Bancontact openen, terugkeren, Mollie kiezen, en twee keer betalen. Er
 * mag er dus altijd hoogstens één openstaan.
 *
 * De provider heeft hier het laatste woord, niet onze eigen rij: blijkt er net
 * betaald te zijn, dan wordt de bestelling alsnog vervuld en start er geen
 * tweede betaling. Blijft ze na een annuleerpoging toch "pending", dan geven we
 * op in plaats van te gokken; een tweede checkout ernaast is precies wat we
 * proberen te vermijden.
 */
async function closeLivePayments(order: {
  id: string;
  totalCents: number;
  currency: string;
  payments: { id: string; provider: string; providerCheckoutId: string | null; status: string }[];
}): Promise<"CLOSED" | "PAID" | "UNSAFE"> {
  for (const payment of order.payments) {
    if (payment.status !== "CREATED" && payment.status !== "PENDING") continue;

    if (!payment.providerCheckoutId) {
      await prisma.ticketPayment.updateMany({
        where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
        data: { status: "CANCELLED", failedAt: new Date() },
      });
      continue;
    }

    try {
      const gateway = paymentGatewayFor(payment.provider);
      let status = await gateway.getCheckoutStatus(payment.providerCheckoutId);
      if (status.status === "PENDING") {
        await gateway.expireCheckout(payment.providerCheckoutId);
        status = await gateway.getCheckoutStatus(payment.providerCheckoutId);
      }

      if (status.status === "SUCCEEDED") {
        // Bedrag en munt moeten kloppen voor we tickets uitgeven. `orderId` komt
        // niet bij elke provider terug (Bancontact draagt enkel een referentie),
        // dus die controleren we enkel wanneer hij er is.
        if (
          (status.orderId != null && status.orderId !== order.id) ||
          (status.amountCents != null && status.amountCents !== order.totalCents) ||
          (status.currency != null && status.currency.toUpperCase() !== order.currency.toUpperCase())
        ) {
          console.error("Live checkout succeeded but did not match the order", {
            orderId: order.id,
            paymentId: payment.id,
          });
          return "UNSAFE";
        }
        await fulfillPaidOrder({
          orderId: order.id,
          provider: payment.provider,
          providerPaymentId: status.paymentId ?? status.checkoutId,
          providerCheckoutId: status.checkoutId,
          amountCents: order.totalCents,
          currency: order.currency,
        });
        return "PAID";
      }

      if (status.status === "PENDING") return "UNSAFE";

      await prisma.ticketPayment.updateMany({
        where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
        data: {
          status: status.status === "EXPIRED" ? "EXPIRED" : "CANCELLED",
          failedAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Unable to safely close a live checkout", {
        orderId: order.id,
        paymentId: payment.id,
        error,
      });
      return "UNSAFE";
    }
  }
  return "CLOSED";
}

/**
 * Start een betaling voor een bestelling die al bestaat, met de betaalwijze die
 * de koper koos. Elke poging krijgt een eigen volgnummer, en dus een eigen
 * idempotency-sleutel: zonder dat botst een tweede poging op de unieke index en
 * zou de provider stilzwijgend de eerste checkout teruggeven.
 */
export async function startOrderPayment(input: {
  orderId: string;
  provider: PaymentProviderName;
  locale: "nl" | "en";
}): Promise<StartPaymentResult> {
  const methods = enabledPaymentMethods();
  if (!methods.includes(input.provider)) {
    console.error("Ticket payment asked for a payment method that is not enabled", {
      orderId: input.orderId,
      requested: input.provider,
      enabled: methods,
    });
    return { ok: false, code: "METHOD_UNAVAILABLE" };
  }

  const order = await prisma.ticketOrder.findUnique({
    where: { id: input.orderId },
    include: {
      event: { select: { titleNl: true, titleEn: true } },
      items: { select: { ticketTypeName: true, unitPriceCents: true } },
      payments: {
        select: { id: true, provider: true, providerCheckoutId: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") {
    return { ok: false, code: "ALREADY_PAID" };
  }
  if (order.status !== "PENDING_PAYMENT") return { ok: false, code: "ORDER_NOT_PAYABLE" };
  if (order.totalCents <= 0) return { ok: false, code: "ORDER_NOT_PAYABLE" };
  if (!order.reservationExpiresAt || order.reservationExpiresAt <= new Date()) {
    return { ok: false, code: "RESERVATION_EXPIRED" };
  }

  const closed = await closeLivePayments(order);
  if (closed === "PAID") return { ok: false, code: "ALREADY_PAID" };
  if (closed === "UNSAFE") return { ok: false, code: "PAYMENT_PENDING_ELSEWHERE" };

  // De regels van de checkout komen uit de bestelling zelf, niet uit het
  // tickettype: de naam en de prijs staan daar vastgelegd zoals ze golden op het
  // moment van bestellen, en een latere prijswijziging mag dit bedrag niet meer
  // veranderen.
  const lineByKey = new Map<string, CheckoutLine>();
  for (const item of order.items) {
    const key = `${item.ticketTypeName}:${item.unitPriceCents}`;
    const existing = lineByKey.get(key);
    if (existing) existing.quantity += 1;
    else {
      lineByKey.set(key, {
        name: item.ticketTypeName,
        quantity: 1,
        unitAmountCents: item.unitPriceCents,
      });
    }
  }

  const context: CheckoutContext = {
    orderId: order.id,
    orderNumber: order.reference,
    buyerEmail: order.buyerEmail,
    eventName:
      input.locale === "en" && order.event.titleEn ? order.event.titleEn : order.event.titleNl,
    currency: order.currency,
    lines: [...lineByKey.values()],
    expiresAt: order.reservationExpiresAt,
    locale: input.locale,
    totalCents: order.totalCents,
  };

  let checkout: CheckoutResult;
  try {
    checkout = await createAndPersistCheckout(context, input.provider, order.payments.length + 1);
  } catch (error) {
    if (error instanceof CheckoutCreationError) {
      // De bestelling blijft staan: de koper mag de andere betaalwijze proberen.
      await prisma.ticketPayment.updateMany({
        where: { id: error.paymentId, status: { in: ["CREATED", "PENDING"] } },
        data: { status: "FAILED", failedAt: new Date() },
      });
      return { ok: false, code: "PAYMENT_UNAVAILABLE" };
    }
    throw error;
  }

  if (checkout.status === "SUCCEEDED") {
    try {
      await fulfillPaidOrder({
        orderId: order.id,
        provider: checkout.provider,
        providerPaymentId: checkout.paymentId ?? checkout.checkoutId,
        providerCheckoutId: checkout.checkoutId,
        amountCents: order.totalCents,
        currency: order.currency,
      });
    } catch (error) {
      console.error("Immediate ticket fulfillment failed; webhook will retry", {
        orderId: order.id,
        error,
      });
    }
  }

  return { ok: true, provider: input.provider, checkoutUrl: checkout.url };
}
