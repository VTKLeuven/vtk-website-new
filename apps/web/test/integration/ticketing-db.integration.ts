import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { POST as processMollieWebhook } from "@/app/api/tickets/mollie/webhook/route";
import { createOrderAccessToken, secureTokenHash } from "@/lib/ticketing/crypto";
import { reserveInventory } from "@/lib/ticketing/inventory";
import {
  createTicketCheckout,
  expirePendingOrder,
  fulfillPaidOrder,
} from "@/lib/ticketing/orders";
import { processTicketOutbox } from "@/lib/ticketing/outbox";
import {
  completeTicketRefund,
  failTicketRefund,
  requestTicketRefund,
} from "@/lib/ticketing/refunds";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@vtk/auth/server", () => ({ getSession: vi.fn(async () => null) }));

describe.sequential("ticketing database invariants", () => {
  const ids = {
    user: randomUUID(),
    group: randomUUID(),
    event: randomUUID(),
    otherEvent: randomUUID(),
    pool: randomUUID(),
    type: randomUUID(),
    rateEvent: randomUUID(),
    ratePool: randomUUID(),
    rateType: randomUUID(),
    rateFreeType: randomUUID(),
    issuedOrder: randomUUID(),
    issuedItem: randomUUID(),
    mollieOrder: randomUUID(),
    mollieItem: randomUUID(),
    molliePayment: randomUUID(),
    // In Mollie a payment's id is both its checkout handle and payment reference.
    molliePaymentRef: `tr_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
  };

  beforeAll(async () => {
    vi.stubEnv("TICKETING_PAYMENT_PROVIDER", "mock");
    vi.stubEnv("TICKETING_PUBLIC_URL", "http://localhost:3000");
    vi.stubEnv("MOLLIE_API_KEY", "test_integration_only");
    await prisma.user.create({
      data: { id: ids.user, name: "Integration Admin", email: `${ids.user}@example.test`, active: true },
    });
    await prisma.group.create({
      data: {
        id: ids.group,
        code: "ALGEMEEN",
        slug: `integration-${ids.group}`,
        nameNl: "Integratie",
        nameEn: "Integration",
      },
    });
    for (const [id, slug] of [[ids.event, "primary"], [ids.otherEvent, "other"]] as const) {
      await prisma.ticketEvent.create({
        data: {
          id,
          ownerGroupId: ids.group,
          slug: `integration-${slug}-${id}`,
          titleNl: `Integratie ${slug}`,
          startsAt: new Date("2027-03-20T19:00:00.000Z"),
          endsAt: new Date("2027-03-21T01:00:00.000Z"),
          createdById: ids.user,
        },
      });
    }
    await prisma.ticketInventoryPool.create({
      data: {
        id: ids.pool,
        eventId: ids.event,
        code: "GENERAL",
        nameNl: "Algemeen",
        capacity: 1,
      },
    });
    await prisma.ticketType.create({
      data: {
        id: ids.type,
        eventId: ids.event,
        inventoryPoolId: ids.pool,
        code: "FREE",
        nameNl: "Gratis",
        unitPriceCents: 0,
      },
    });
    await prisma.ticketEvent.create({
      data: {
        id: ids.rateEvent,
        ownerGroupId: ids.group,
        slug: `integration-rate-${ids.rateEvent}`,
        titleNl: "Integratie limiet",
        startsAt: new Date("2027-05-20T19:00:00.000Z"),
        endsAt: new Date("2027-05-21T01:00:00.000Z"),
        status: "PUBLISHED",
        maxTicketsPerOrder: 8,
        createdById: ids.user,
      },
    });
    await prisma.ticketInventoryPool.create({
      data: {
        id: ids.ratePool,
        eventId: ids.rateEvent,
        code: "RATE",
        nameNl: "Limiet",
        capacity: 30,
      },
    });
    await prisma.ticketType.create({
      data: {
        id: ids.rateType,
        eventId: ids.rateEvent,
        inventoryPoolId: ids.ratePool,
        code: "RATE",
        nameNl: "Limiettest",
        unitPriceCents: 100,
      },
    });
    await prisma.ticketType.create({
      data: {
        id: ids.rateFreeType,
        eventId: ids.rateEvent,
        inventoryPoolId: ids.ratePool,
        code: "FREE_LOGIN",
        nameNl: "Gratis met login",
        unitPriceCents: 0,
      },
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("never reserves the final inventory unit twice", async () => {
    const attempts = await Promise.allSettled([
      prisma.$transaction((tx) => reserveInventory(tx, ids.event, new Map([[ids.pool, 1]]))),
      prisma.$transaction((tx) => reserveInventory(tx, ids.event, new Map([[ids.pool, 1]]))),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(await prisma.ticketInventoryPool.findUnique({ where: { id: ids.pool } })).toMatchObject({
      reservedCount: 1,
      soldCount: 0,
    });
  });

  it("serializes the pending-reservation cap for concurrent checkouts", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        createTicketCheckout(
          {
            eventId: ids.rateEvent,
            buyerName: `Rate Buyer ${index}`,
            buyerEmail: "rate-limit@example.test",
            locale: "nl",
            termsAccepted: true,
            items: [
              {
                ticketTypeId: ids.rateType,
                attendeeName: `Rate Attendee ${index}`,
                attendeeEmail: "",
                answers: {},
              },
            ],
          },
          "same-integration-fingerprint"
        )
      )
    );
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(3);
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "TOO_MANY_RESERVATIONS",
    });
  });

  it("requires an account for a fully free public order", async () => {
    await expect(
      createTicketCheckout(
        {
          eventId: ids.rateEvent,
          buyerName: "Anonymous Free Buyer",
          buyerEmail: "free-anonymous@example.test",
          locale: "nl",
          termsAccepted: true,
          items: [
            {
              ticketTypeId: ids.rateFreeType,
              attendeeName: "Anonymous Attendee",
              attendeeEmail: "",
              answers: {},
            },
          ],
        },
        "anonymous-free-fingerprint"
      )
    ).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
  });

  it("caps valid free tickets per authenticated user across orders", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: ids.user,
        name: "Integration Admin",
        email: `${ids.user}@example.test`,
        isSuperAdmin: false,
      },
    } as never);
    const items = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, index) => ({
        ticketTypeId: ids.rateFreeType,
        attendeeName: `${prefix} ${index}`,
        attendeeEmail: "",
        answers: {},
      }));
    try {
      await createTicketCheckout(
        {
          eventId: ids.rateEvent,
          buyerName: "Authenticated Free Buyer",
          buyerEmail: `${ids.user}@example.test`,
          locale: "nl",
          termsAccepted: true,
          items: items(5, "First free attendee"),
        },
        "authenticated-free-fingerprint"
      );
      await expect(
        createTicketCheckout(
          {
            eventId: ids.rateEvent,
            buyerName: "Authenticated Free Buyer",
            buyerEmail: `${ids.user}@example.test`,
            locale: "nl",
            termsAccepted: true,
            items: items(4, "Second free attendee"),
          },
          "authenticated-free-fingerprint"
        )
      ).rejects.toMatchObject({ code: "FREE_TICKET_LIMIT" });
    } finally {
      vi.mocked(getSession).mockResolvedValue(null);
    }
  });

  it("fulfills a Mollie webhook once and deduplicates its retry", async () => {
    const accessExpiresAt = new Date("2027-06-20T00:00:00.000Z");
    const access = createOrderAccessToken(ids.mollieOrder, accessExpiresAt);
    await prisma.$transaction(async (tx) => {
      await reserveInventory(tx, ids.rateEvent, new Map([[ids.ratePool, 1]]));
      await tx.ticketOrder.create({
        data: {
          id: ids.mollieOrder,
          eventId: ids.rateEvent,
          reference: `VTK-MOLLIE-${ids.mollieOrder}`,
          accessTokenHash: secureTokenHash(access),
          accessExpiresAt,
          buyerName: "Mollie Buyer",
          buyerEmail: "mollie@example.test",
          subtotalCents: 100,
          totalCents: 100,
          reservationExpiresAt: new Date("2027-05-01T00:00:00.000Z"),
          termsAcceptedAt: new Date(),
          items: {
            create: {
              id: ids.mollieItem,
              ticketTypeId: ids.rateType,
              inventoryPoolId: ids.ratePool,
              ticketTypeCode: "RATE",
              ticketTypeName: "Limiettest",
              unitPriceCents: 100,
              totalCents: 100,
              attendeeName: "Mollie Attendee",
            },
          },
          payments: {
            create: {
              id: ids.molliePayment,
              provider: "mollie",
              providerCheckoutId: ids.molliePaymentRef,
              idempotencyKey: `${ids.mollieOrder}:1`,
              status: "PENDING",
              amountCents: 100,
              currency: "EUR",
            },
          },
        },
      });
    });

    // The webhook re-fetches the authoritative payment from Mollie; stub that
    // network call to return a paid payment for our order.
    const molliePaymentPayload = {
      id: ids.molliePaymentRef,
      status: "paid",
      amount: { currency: "EUR", value: "1.00" },
      amountRefunded: { currency: "EUR", value: "0.00" },
      metadata: { vtk_order_id: ids.mollieOrder, vtk_order_number: ids.mollieOrder },
    };
    // Return a fresh Response per call: the webhook is invoked twice (original +
    // dedup retry), and a single shared Response can only have its body read once.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(molliePaymentPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      );

    // Mollie posts application/x-www-form-urlencoded with only the payment id.
    const webhookRequest = () =>
      new Request("http://localhost/api/tickets/mollie/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: ids.molliePaymentRef }).toString(),
      });

    try {
      expect((await processMollieWebhook(webhookRequest())).status).toBe(200);
      expect(await prisma.ticketOrder.findUnique({ where: { id: ids.mollieOrder } })).toMatchObject({
        status: "PAID",
      });
      expect(await prisma.ticketPayment.findUnique({ where: { id: ids.molliePayment } })).toMatchObject({
        status: "SUCCEEDED",
        providerPaymentId: ids.molliePaymentRef,
      });
      expect(await prisma.ticket.count({ where: { orderItemId: ids.mollieItem, status: "VALID" } })).toBe(1);

      const duplicate = await processMollieWebhook(webhookRequest());
      expect(duplicate.status).toBe(200);
      expect(await duplicate.json()).toMatchObject({ received: true, duplicate: true });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("keeps payment and refund races internally consistent", async () => {
    const refundId = randomUUID();
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { orderItemId: ids.mollieItem },
    });
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: "VOID", voidedAt: new Date() },
      }),
      prisma.ticketRefund.create({
        data: {
          id: refundId,
          orderId: ids.mollieOrder,
          paymentId: ids.molliePayment,
          provider: "mollie",
          idempotencyKey: refundId,
          amountCents: 100,
          currency: "EUR",
          requestedById: ids.user,
          items: { create: { orderItemId: ids.mollieItem, amountCents: 100 } },
        },
      }),
    ]);
    await Promise.allSettled([
      completeTicketRefund(refundId, `re_${refundId}`),
      failTicketRefund(refundId, `re_${refundId}`),
    ]);
    expect(await prisma.ticketRefund.findUnique({ where: { id: refundId } })).toMatchObject({
      status: "SUCCEEDED",
    });
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toMatchObject({
      status: "REFUNDED",
    });

    const raceOrderId = randomUUID();
    const raceItemId = randomUUID();
    const racePaymentId = randomUUID();
    const accessExpiresAt = new Date("2027-06-20T00:00:00.000Z");
    const access = createOrderAccessToken(raceOrderId, accessExpiresAt);
    const poolBefore = await prisma.ticketInventoryPool.findUniqueOrThrow({ where: { id: ids.ratePool } });
    await prisma.$transaction(async (tx) => {
      await reserveInventory(tx, ids.rateEvent, new Map([[ids.ratePool, 1]]));
      await tx.ticketOrder.create({
        data: {
          id: raceOrderId,
          eventId: ids.rateEvent,
          reference: `VTK-RACE-${raceOrderId}`,
          accessTokenHash: secureTokenHash(access),
          accessExpiresAt,
          buyerName: "Race Buyer",
          buyerEmail: "race@example.test",
          subtotalCents: 100,
          totalCents: 100,
          reservationExpiresAt: new Date("2027-05-01T00:00:00.000Z"),
          termsAcceptedAt: new Date(),
          items: {
            create: {
              id: raceItemId,
              ticketTypeId: ids.rateType,
              inventoryPoolId: ids.ratePool,
              ticketTypeCode: "RATE",
              ticketTypeName: "Limiettest",
              unitPriceCents: 100,
              totalCents: 100,
              attendeeName: "Race Attendee",
            },
          },
          payments: {
            create: {
              id: racePaymentId,
              provider: "mollie",
              providerCheckoutId: `tr_race_${raceOrderId.replace(/-/g, "").slice(0, 10)}`,
              idempotencyKey: `${raceOrderId}:1`,
              status: "PENDING",
              amountCents: 100,
            },
          },
        },
      });
    });
    await Promise.allSettled([
      fulfillPaidOrder({
        orderId: raceOrderId,
        provider: "mollie",
        providerPaymentId: `tr_race_${raceOrderId.replace(/-/g, "").slice(0, 10)}`,
        providerCheckoutId: `tr_race_${raceOrderId.replace(/-/g, "").slice(0, 10)}`,
        amountCents: 100,
        currency: "EUR",
      }),
      expirePendingOrder(raceOrderId),
    ]);
    const raceOrder = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: raceOrderId } });
    expect(["PAID", "EXPIRED"]).toContain(raceOrder.status);
    const poolAfter = await prisma.ticketInventoryPool.findUniqueOrThrow({ where: { id: ids.ratePool } });
    expect(poolAfter.reservedCount).toBe(poolBefore.reservedCount);
    expect(poolAfter.soldCount - poolBefore.soldCount).toBe(raceOrder.status === "PAID" ? 1 : 0);
    expect(await prisma.ticket.count({ where: { orderItemId: raceItemId } })).toBe(
      raceOrder.status === "PAID" ? 1 : 0
    );
  });

  it("issues a free order atomically and supports a complete refund", async () => {
    const expires = new Date("2027-04-20T00:00:00.000Z");
    const access = createOrderAccessToken(ids.issuedOrder, expires);
    await prisma.ticketOrder.create({
      data: {
        id: ids.issuedOrder,
        eventId: ids.event,
        reference: `VTK-INT-${ids.issuedOrder}`,
        accessTokenHash: secureTokenHash(access),
        accessExpiresAt: expires,
        buyerName: "Test Buyer",
        buyerEmail: "buyer@example.test",
        status: "PENDING_PAYMENT",
        subtotalCents: 0,
        totalCents: 0,
        reservationExpiresAt: new Date("2027-03-01T00:00:00.000Z"),
        termsAcceptedAt: new Date(),
        items: {
          create: {
            id: ids.issuedItem,
            ticketTypeId: ids.type,
            inventoryPoolId: ids.pool,
            ticketTypeCode: "FREE",
            ticketTypeName: "Gratis",
            unitPriceCents: 0,
            totalCents: 0,
            attendeeName: "Test Attendee",
            attendeeEmail: "attendee@example.test",
          },
        },
        payments: {
          create: {
            provider: "free",
            idempotencyKey: `${ids.issuedOrder}:1`,
            status: "CREATED",
            amountCents: 0,
          },
        },
      },
    });
    await fulfillPaidOrder({
      orderId: ids.issuedOrder,
      provider: "free",
      providerPaymentId: `free_${ids.issuedOrder}`,
      amountCents: 0,
      currency: "EUR",
    });
    expect(await prisma.ticketOrder.findUnique({ where: { id: ids.issuedOrder } })).toMatchObject({
      status: "PAID",
      totalCents: 0,
    });
    expect(await prisma.ticketInventoryPool.findUnique({ where: { id: ids.pool } })).toMatchObject({
      reservedCount: 0,
      soldCount: 1,
    });
    expect(await prisma.ticket.count({ where: { orderItemId: ids.issuedItem, status: "VALID" } })).toBe(1);

    const refund = await requestTicketRefund({
      eventId: ids.event,
      orderId: ids.issuedOrder,
      orderItemIds: [ids.issuedItem],
      requestedById: ids.user,
      reason: "Integration test",
    });
    expect(refund.status).toBe("SUCCEEDED");
    expect(await prisma.ticketOrder.findUnique({ where: { id: ids.issuedOrder } })).toMatchObject({
      status: "REFUNDED",
      refundedCents: 0,
    });
    expect(await prisma.ticket.count({ where: { orderItemId: ids.issuedItem, status: "REFUNDED" } })).toBe(1);
    expect(await prisma.ticketInventoryPool.findUnique({ where: { id: ids.pool } })).toMatchObject({
      reservedCount: 0,
      soldCount: 0,
    });

    const message = await prisma.ticketOutboxMessage.findFirstOrThrow({ where: { orderId: ids.issuedOrder } });
    await prisma.ticketOutboxMessage.update({
      where: { id: message.id },
      data: { status: "PROCESSING", lockedAt: new Date(Date.now() - 10 * 60_000), lockedBy: "dead-worker" },
    });
    const processed = await processTicketOutbox(5);
    expect(processed.failed).toBe(0);
    expect(processed.sent).toBeGreaterThanOrEqual(1);
    expect(await prisma.ticketOutboxMessage.findUnique({ where: { id: message.id } })).toMatchObject({
      status: "SENT",
    });
  });

  it("rejects cross-event scan references at the foreign key boundary", async () => {
    const foreignGate = await prisma.ticketGate.create({
      data: { eventId: ids.otherEvent, code: "OTHER", name: "Andere ingang" },
    });
    await expect(
      prisma.ticketScanLog.create({
        data: {
          eventId: ids.event,
          gateId: foreignGate.id,
          clientScanId: randomUUID(),
          result: "INVALID",
        },
      })
    ).rejects.toThrow();
  });

  it("rejects cross-order financial and answer references", async () => {
    const otherOrderId = randomUUID();
    const otherPaymentId = randomUUID();
    const expires = new Date("2027-04-20T00:00:00.000Z");
    const access = createOrderAccessToken(otherOrderId, expires);
    await prisma.ticketOrder.create({
      data: {
        id: otherOrderId,
        eventId: ids.otherEvent,
        reference: `VTK-OTHER-${otherOrderId}`,
        accessTokenHash: secureTokenHash(access),
        accessExpiresAt: expires,
        buyerName: "Other Buyer",
        buyerEmail: "other@example.test",
        subtotalCents: 0,
        totalCents: 0,
        reservationExpiresAt: new Date("2027-03-01T00:00:00.000Z"),
        termsAcceptedAt: new Date(),
      },
    });
    await prisma.ticketPayment.create({
      data: {
        id: otherPaymentId,
        orderId: otherOrderId,
        provider: "free",
        idempotencyKey: `${otherOrderId}:1`,
        amountCents: 0,
      },
    });

    await expect(
      prisma.ticketRefund.create({
        data: {
          orderId: ids.issuedOrder,
          paymentId: otherPaymentId,
          provider: "free",
          idempotencyKey: randomUUID(),
          amountCents: 0,
        },
      })
    ).rejects.toThrow();

    const issuedRefund = await prisma.ticketRefund.findFirstOrThrow({
      where: { orderId: ids.issuedOrder },
    });
    await expect(
      prisma.ticketRefundItem.create({
        data: {
          orderId: otherOrderId,
          refundId: issuedRefund.id,
          orderItemId: ids.issuedItem,
          amountCents: 0,
        },
      })
    ).rejects.toThrow();

    const foreignQuestion = await prisma.ticketQuestion.create({
      data: {
        eventId: ids.otherEvent,
        code: `FOREIGN_${randomUUID()}`,
        labelNl: "Andere vraag",
        type: "SHORT_TEXT",
      },
    });
    await expect(
      prisma.ticketOrderItemAnswer.create({
        data: {
          eventId: ids.event,
          orderItemId: ids.issuedItem,
          questionId: foreignQuestion.id,
          questionCode: foreignQuestion.code,
          questionLabel: foreignQuestion.labelNl,
          value: "onmogelijk",
        },
      })
    ).rejects.toThrow();
  });
});
