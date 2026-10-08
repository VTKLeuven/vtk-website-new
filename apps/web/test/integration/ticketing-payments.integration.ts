import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import { POST as bancontactWebhook } from "@/app/api/tickets/bancontact/webhook/route";
import { POST as mollieWebhook } from "@/app/api/tickets/mollie/webhook/route";
import { createOrderAccessToken, secureTokenHash } from "@/lib/ticketing/crypto";
import { quantitiesByPool, reserveInventory } from "@/lib/ticketing/inventory";
import {
  expirePendingOrder,
  fulfillPaidOrder,
  PAYMENT_NEEDS_REFUND,
  releaseExpiredOrders,
  startOrderPayment,
} from "@/lib/ticketing/orders";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@vtk/auth/server", () => ({ getSession: vi.fn(async () => null) }));

/**
 * Een nagebootste Bancontact-API: de tests zeggen welke status een betaling
 * heeft, en zien welke betalingen de site annuleerde.
 */
const bancontact = {
  payments: new Map<string, { status: string; amount: number }>(),
  cancelled: [] as string[],
  reset() {
    this.payments.clear();
    this.cancelled = [];
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bancontactPayload(id: string) {
  const payment = bancontact.payments.get(id)!;
  return {
    paymentId: id,
    status: payment.status,
    amount: payment.amount,
    currency: "EUR",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    _links: { deeplink: { href: `https://pay.example.test/${id}` } },
  };
}

async function fakeBancontactApi(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  const method = init?.method ?? "GET";
  const match = url.pathname.match(/^\/v3\/payments\/?([^/]*)$/);
  if (!match) return json({ code: "NOT_FOUND" }, 404);
  const id = decodeURIComponent(match[1] ?? "");
  if (method === "POST" && !id) {
    const body = JSON.parse(String(init?.body)) as { amount: number };
    const newId = `tx${randomUUID().replace(/-/g, "").slice(0, 22)}`;
    bancontact.payments.set(newId, { status: "PENDING", amount: body.amount });
    return json(bancontactPayload(newId), 201);
  }
  const payment = bancontact.payments.get(id);
  if (!payment) return json({ code: "PAYMENT_NOT_FOUND" }, 404);
  if (method === "DELETE") {
    bancontact.cancelled.push(id);
    if (payment.status !== "PENDING") return json({ code: "PAYMENT_NOT_PENDING" }, 422);
    payment.status = "CANCELLED";
    return new Response(null, { status: 204 });
  }
  return json(bancontactPayload(id));
}

function bancontactCallback(paymentId: string) {
  return bancontactWebhook(
    new Request("http://localhost/api/tickets/bancontact/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    })
  );
}

describe.sequential("ticket payments", () => {
  const ids = {
    user: randomUUID(),
    group: randomUUID(),
    event: randomUUID(),
    pool: randomUUID(),
    type: randomUUID(),
  };
  const CAPACITY = 100;

  beforeAll(async () => {
    vi.stubEnv("TICKETING_PAYMENT_PROVIDER", "bancontact");
    vi.stubEnv("TICKETING_PAYMENT_METHODS", "bancontact,mollie");
    vi.stubEnv("TICKETING_PUBLIC_URL", "http://localhost:3000");
    vi.stubEnv("BANCONTACT_API_KEY", "test_integration_only");
    vi.stubEnv("BANCONTACT_API_BASE", "https://bancontact.example.test");
    vi.stubEnv("MOLLIE_API_KEY", "test_integration_only");
    await prisma.user.create({
      data: { id: ids.user, name: "Payments Admin", email: `${ids.user}@example.test`, active: true },
    });
    await prisma.group.create({
      data: {
        id: ids.group,
        code: `payments-${ids.group}`,
        slug: `payments-${ids.group}`,
        nameNl: "Betalingen",
        nameEn: "Payments",
      },
    });
    await prisma.ticketEvent.create({
      data: {
        id: ids.event,
        ownerGroupId: ids.group,
        slug: `payments-${ids.event}`,
        titleNl: "Betaalcantus",
        startsAt: new Date("2027-10-12T16:00:00.000Z"),
        endsAt: new Date("2027-10-12T23:00:00.000Z"),
        status: "PUBLISHED",
        createdById: ids.user,
      },
    });
    await prisma.ticketInventoryPool.create({
      data: { id: ids.pool, eventId: ids.event, code: "GENERAL", nameNl: "Algemeen", capacity: CAPACITY },
    });
    await prisma.ticketType.create({
      data: {
        id: ids.type,
        eventId: ids.event,
        inventoryPoolId: ids.pool,
        code: "BIER",
        nameNl: "Bierticket",
        unitPriceCents: 1400,
      },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(fakeBancontactApi);
  });

  afterEach(() => bancontact.reset());

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  /** Een bestelling van één ticket met een gereserveerde plaats, zoals na een checkout. */
  async function pendingOrder(options: { reservationExpiresAt?: Date } = {}) {
    const orderId = randomUUID();
    const accessExpiresAt = new Date("2027-10-13T00:00:00.000Z");
    await prisma.$transaction(async (tx) => {
      await reserveInventory(tx, ids.event, quantitiesByPool([{ inventoryPoolId: ids.pool }]));
      await tx.ticketOrder.create({
        data: {
          id: orderId,
          eventId: ids.event,
          reference: `VTK-TEST-${orderId.slice(0, 8)}`,
          accessTokenHash: secureTokenHash(createOrderAccessToken(orderId, accessExpiresAt)),
          accessExpiresAt,
          buyerName: "Koper",
          buyerEmail: `${orderId}@example.test`,
          subtotalCents: 1400,
          totalCents: 1400,
          reservationExpiresAt: options.reservationExpiresAt ?? new Date(Date.now() + 31 * 60_000),
          termsAcceptedAt: new Date(),
          items: {
            create: {
              ticketTypeId: ids.type,
              inventoryPoolId: ids.pool,
              ticketTypeCode: "BIER",
              ticketTypeName: "Bierticket",
              unitPriceCents: 1400,
              totalCents: 1400,
              attendeeName: "Koper",
            },
          },
        },
      });
    });
    return orderId;
  }

  /** Een Bancontact-poging op die bestelling, bij de provider én bij ons. */
  async function bancontactAttempt(orderId: string, status = "PENDING", attempt = 1) {
    const providerId = `tx${randomUUID().replace(/-/g, "").slice(0, 22)}`;
    bancontact.payments.set(providerId, { status, amount: 1400 });
    await prisma.ticketPayment.create({
      data: {
        orderId,
        provider: "bancontact",
        providerCheckoutId: providerId,
        providerPaymentId: providerId,
        idempotencyKey: `${orderId}:${attempt}`,
        status: "PENDING",
        amountCents: 1400,
        currency: "EUR",
      },
    });
    return providerId;
  }

  async function pool() {
    return prisma.ticketInventoryPool.findUniqueOrThrow({ where: { id: ids.pool } });
  }

  async function ticketsOf(orderId: string) {
    return prisma.ticket.count({ where: { orderItem: { orderId } } });
  }

  it("keeps the order when its Bancontact QR expires, so a new QR can still be paid", async () => {
    const orderId = await pendingOrder();
    const first = await bancontactAttempt(orderId);
    const before = await pool();

    bancontact.payments.get(first)!.status = "EXPIRED";
    expect((await bancontactCallback(first)).status).toBe(200);

    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PENDING_PAYMENT",
    });
    expect(
      await prisma.ticketPayment.findFirstOrThrow({ where: { providerCheckoutId: first } })
    ).toMatchObject({ status: "EXPIRED" });
    // De plaats blijft van deze koper.
    expect((await pool()).reservedCount).toBe(before.reservedCount);

    // "Nieuwe QR-code" werkt, en die betalen levert het ticket.
    const renewed = await startOrderPayment({ orderId, provider: "bancontact", locale: "nl" });
    expect(renewed.ok).toBe(true);
    const second = await prisma.ticketPayment.findFirstOrThrow({
      where: { orderId, status: "PENDING" },
    });
    bancontact.payments.get(second.providerCheckoutId!)!.status = "SUCCEEDED";
    expect((await bancontactCallback(second.providerCheckoutId!)).status).toBe(200);
    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PAID",
    });
    expect(await ticketsOf(orderId)).toBe(1);
  });

  it("replays VTK-26-DCE77A9579: a late cancel of the old QR no longer kills the new one", async () => {
    const orderId = await pendingOrder();
    const first = await bancontactAttempt(orderId);

    // De koper vraagt opnieuw te betalen: de site annuleert de eerste QR en
    // maakt een tweede.
    const restarted = await startOrderPayment({ orderId, provider: "bancontact", locale: "nl" });
    expect(restarted.ok).toBe(true);
    expect(bancontact.cancelled).toEqual([first]);
    const second = await prisma.ticketPayment.findFirstOrThrow({
      where: { orderId, status: "PENDING" },
    });

    // Bancontact meldt de annulering van de eerste: dat mag niets breken.
    expect((await bancontactCallback(first)).status).toBe(200);
    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PENDING_PAYMENT",
    });

    // De koper betaalt de tweede QR.
    bancontact.payments.get(second.providerCheckoutId!)!.status = "SUCCEEDED";
    expect((await bancontactCallback(second.providerCheckoutId!)).status).toBe(200);
    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PAID",
    });
    expect(await ticketsOf(orderId)).toBe(1);
  });

  it("keeps the order when a Mollie checkout is cancelled", async () => {
    const orderId = await pendingOrder();
    const mollieId = `tr_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await prisma.ticketPayment.create({
      data: {
        orderId,
        provider: "mollie",
        providerCheckoutId: mollieId,
        idempotencyKey: `${orderId}:1`,
        status: "PENDING",
        amountCents: 1400,
        currency: "EUR",
      },
    });
    const fetchSpy = vi.mocked(globalThis.fetch);
    fetchSpy.mockImplementationOnce(async () =>
      json({
        id: mollieId,
        status: "canceled",
        amount: { currency: "EUR", value: "14.00" },
        amountRefunded: { currency: "EUR", value: "0.00" },
        metadata: { vtk_order_id: orderId, vtk_order_number: orderId },
      })
    );
    const response = await mollieWebhook(
      new Request("http://localhost/api/tickets/mollie/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: mollieId }).toString(),
      })
    );
    expect(response.status).toBe(200);
    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PENDING_PAYMENT",
    });
    expect(
      await prisma.ticketPayment.findFirstOrThrow({ where: { providerCheckoutId: mollieId } })
    ).toMatchObject({ status: "FAILED" });
  });

  it("never cancels a payment the buyer has open in their app", async () => {
    const orderId = await pendingOrder();
    const live = await bancontactAttempt(orderId, "IDENTIFIED");

    const result = await startOrderPayment({ orderId, provider: "mollie", locale: "nl" });
    expect(result).toEqual({ ok: false, code: "PAYMENT_IN_PROGRESS" });
    expect(bancontact.cancelled).toEqual([]);
    expect(bancontact.payments.get(live)!.status).toBe("IDENTIFIED");
    expect(await prisma.ticketPayment.count({ where: { orderId } })).toBe(1);
  });

  it("closes a live QR at Bancontact before the reservation timer expires the order", async () => {
    // Ver in het verleden, zodat deze bestelling bij de eerste honderd zit.
    const orderId = await pendingOrder({ reservationExpiresAt: new Date("2020-01-01T00:00:00.000Z") });
    const live = await bancontactAttempt(orderId);
    const before = await pool();

    await releaseExpiredOrders(100);

    expect(bancontact.cancelled).toContain(live);
    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "EXPIRED",
    });
    expect((await pool()).reservedCount).toBe(before.reservedCount - 1);
  });

  it("waits with expiring while the buyer is confirming in their app", async () => {
    const orderId = await pendingOrder({ reservationExpiresAt: new Date("2020-01-01T00:00:00.000Z") });
    const live = await bancontactAttempt(orderId, "AUTHORIZED");

    await releaseExpiredOrders(100);

    expect(bancontact.cancelled).not.toContain(live);
    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PENDING_PAYMENT",
    });
  });

  it("still issues the ticket when the payment lands after the order expired", async () => {
    const orderId = await pendingOrder();
    const live = await bancontactAttempt(orderId);
    expect(await expirePendingOrder(orderId)).toBe(true);
    const afterExpiry = await pool();

    bancontact.payments.get(live)!.status = "SUCCEEDED";
    expect((await bancontactCallback(live)).status).toBe(200);

    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "PAID",
      expiredAt: null,
    });
    expect(await ticketsOf(orderId)).toBe(1);
    const after = await pool();
    expect(after.soldCount).toBe(afterExpiry.soldCount + 1);
    expect(after.reservedCount).toBe(afterExpiry.reservedCount);
    expect(
      await prisma.ticketOutboxMessage.count({ where: { dedupeKey: `order-confirmation:${orderId}` } })
    ).toBe(1);
  });

  it("flags a late payment for a refund when its seat is gone, and says so once", async () => {
    const orderId = await pendingOrder();
    const live = await bancontactAttempt(orderId);
    expect(await expirePendingOrder(orderId)).toBe(true);

    // Iemand anders neemt elke resterende plaats.
    const current = await pool();
    const free = current.capacity - current.reservedCount - current.soldCount;
    await prisma.ticketInventoryPool.update({
      where: { id: ids.pool },
      data: { soldCount: { increment: free } },
    });
    const full = await pool();

    bancontact.payments.get(live)!.status = "SUCCEEDED";
    expect((await bancontactCallback(live)).status).toBe(200);
    // Een herhaalde melding legt niets dubbel vast.
    await fulfillPaidOrder({
      orderId,
      provider: "bancontact",
      providerPaymentId: live,
      providerCheckoutId: live,
      amountCents: 1400,
      currency: "EUR",
    });

    expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: "EXPIRED",
    });
    expect(await ticketsOf(orderId)).toBe(0);
    expect(
      await prisma.ticketPayment.findFirstOrThrow({ where: { providerCheckoutId: live } })
    ).toMatchObject({ status: "SUCCEEDED", providerStatus: PAYMENT_NEEDS_REFUND });
    expect(
      await prisma.ticketAuditLog.count({ where: { action: "PAYMENT_NEEDS_REFUND", eventId: ids.event } })
    ).toBe(1);
    expect(await pool()).toMatchObject({ soldCount: full.soldCount, reservedCount: full.reservedCount });

    // Opruimen voor de volgende tests: de plaatsen van "iemand anders" terug.
    await prisma.ticketInventoryPool.update({
      where: { id: ids.pool },
      data: { soldCount: { decrement: free } },
    });
  });

  it("flags a second successful payment on an order that was already paid", async () => {
    const orderId = await pendingOrder();
    const first = await bancontactAttempt(orderId, "PENDING", 1);
    const second = await bancontactAttempt(orderId, "PENDING", 2);

    bancontact.payments.get(first)!.status = "SUCCEEDED";
    expect((await bancontactCallback(first)).status).toBe(200);
    bancontact.payments.get(second)!.status = "SUCCEEDED";
    expect((await bancontactCallback(second)).status).toBe(200);

    expect(await ticketsOf(orderId)).toBe(1);
    expect(
      await prisma.ticketPayment.findFirstOrThrow({ where: { providerCheckoutId: second } })
    ).toMatchObject({ status: "SUCCEEDED", providerStatus: PAYMENT_NEEDS_REFUND });
    expect(
      await prisma.ticketPayment.findFirstOrThrow({ where: { providerCheckoutId: first } })
    ).toMatchObject({ status: "SUCCEEDED", providerStatus: "paid" });
  });

  it("ends a payment racing an expiry the same way every time: paid, one ticket, counters intact", async () => {
    for (let round = 0; round < 15; round += 1) {
      const orderId = await pendingOrder();
      const live = await bancontactAttempt(orderId);
      const before = await pool();

      await Promise.all([
        fulfillPaidOrder({
          orderId,
          provider: "bancontact",
          providerPaymentId: live,
          providerCheckoutId: live,
          amountCents: 1400,
          currency: "EUR",
        }),
        expirePendingOrder(orderId),
      ]);

      expect(await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: "PAID",
      });
      expect(await ticketsOf(orderId)).toBe(1);
      const after = await pool();
      expect(after.soldCount).toBe(before.soldCount + 1);
      expect(after.reservedCount).toBe(before.reservedCount - 1);
    }
  });
});
