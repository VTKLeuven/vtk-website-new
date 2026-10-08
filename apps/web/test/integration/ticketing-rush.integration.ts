import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import { createTicketCheckout } from "@/lib/ticketing/orders";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@vtk/auth/server", () => ({ getSession: vi.fn(async () => null) }));

/**
 * De opening van een cantus: honderden kopers op dezelfde seconde, op één pot.
 *
 * Op 8 oktober 2026 (Eersteplaatscantus, 240 plaatsen) faalden zo ~1200
 * checkouts met "Bestellen is mislukt" terwijl er nog plaatsen waren: elke
 * checkout liep SERIALIZABLE en botste op dezelfde rij van de pot. Deze test
 * legt vast dat zo'n rush eindigt zoals hij hoort te eindigen: elke plaats
 * verkocht, de rest netjes "uitverkocht", en niemand met een andere fout.
 */
describe.sequential("ticket rush", () => {
  const CAPACITY = 240;
  const BUYERS = 300;
  const ids = {
    user: randomUUID(),
    group: randomUUID(),
    event: randomUUID(),
    pool: randomUUID(),
    type: randomUUID(),
  };

  beforeAll(async () => {
    vi.stubEnv("TICKETING_PAYMENT_PROVIDER", "mock");
    vi.stubEnv("TICKETING_PUBLIC_URL", "http://localhost:3000");
    await prisma.user.create({
      data: { id: ids.user, name: "Rush Admin", email: `${ids.user}@example.test`, active: true },
    });
    await prisma.group.create({
      data: {
        id: ids.group,
        code: `rush-${ids.group}`,
        slug: `rush-${ids.group}`,
        nameNl: "Rush",
        nameEn: "Rush",
      },
    });
    await prisma.ticketEvent.create({
      data: {
        id: ids.event,
        ownerGroupId: ids.group,
        slug: `rush-${ids.event}`,
        titleNl: "Rushcantus",
        startsAt: new Date("2027-10-12T16:00:00.000Z"),
        endsAt: new Date("2027-10-12T23:00:00.000Z"),
        status: "PUBLISHED",
        maxTicketsPerOrder: 1,
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
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("sells every seat and answers everyone else with SOLD_OUT", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: BUYERS }, (_, index) =>
        createTicketCheckout(
          {
            eventId: ids.event,
            buyerName: `Koper ${index}`,
            buyerEmail: `rush-${index}-${ids.event}@example.test`,
            locale: "nl",
            termsAccepted: true,
            items: [{ ticketTypeId: ids.type, attendeeName: `Koper ${index}`, attendeeEmail: "" }],
          },
          `rush-fingerprint-${index}`
        )
      )
    );

    const sold = attempts.filter((attempt) => attempt.status === "fulfilled");
    const refusals = attempts
      .filter((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected")
      .map((attempt) => (attempt.reason as { code?: string }).code ?? String(attempt.reason));
    const otherErrors = refusals.filter((code) => code !== "SOLD_OUT");

    expect(otherErrors).toEqual([]);
    expect(sold).toHaveLength(CAPACITY);
    expect(refusals).toHaveLength(BUYERS - CAPACITY);

    const pool = await prisma.ticketInventoryPool.findUniqueOrThrow({ where: { id: ids.pool } });
    expect(pool.reservedCount + pool.soldCount).toBe(CAPACITY);
    expect(await prisma.ticketOrder.count({ where: { eventId: ids.event } })).toBe(CAPACITY);
  }, 120_000);
});
