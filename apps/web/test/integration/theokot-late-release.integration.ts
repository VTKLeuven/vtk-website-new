import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import { brusselsWallClock } from "@/lib/brussels";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mail", () => ({
  sendOrderTakenOver: vi.fn(),
  sendNoShowWarning: vi.fn(),
  sendOrderCancelled: vi.fn(),
}));

import { usageForSessionItems } from "@/lib/meetings-server";
import { releaseOrder, takeOverSandwich } from "@/lib/theokot-orders";
import { processSessionNoShows } from "@/lib/theokot-server";

/**
 * Laat annuleren tegen een echte database: de transacties, de unieke sleutels
 * en de no-show bij het sluiten. Anna bestelt twee kaas en een hesp en
 * annuleert na de deadline; Bram neemt een kaas over, Anna zelf de andere. De
 * hesp neemt niemand. Carl geeft enkel zijn hesp vrij en komt niets halen; Dirk
 * geeft alles vrij en niemand neemt het.
 */
describe.sequential("laat annuleren bij het Theokot", () => {
  const tag = randomUUID().slice(0, 8);
  const dayNumber = 1 + (parseInt(tag.slice(0, 4), 16) % 28);
  const day = brusselsWallClock(2032, 5, dayNumber, "00:00");
  const orderCloseAt = brusselsWallClock(2032, 5, dayNumber, "10:30");
  const pickupStart = brusselsWallClock(2032, 5, dayNumber, "12:00");
  const pickupEnd = brusselsWallClock(2032, 5, dayNumber, "14:00");
  const during = brusselsWallClock(2032, 5, dayNumber, "11:00");
  const userIds: string[] = [];
  let sessionId = "";
  const items = { kaas: "", hesp: "" };
  let anna = "";
  let bram = "";
  let annaOrder = "";
  let carlOrder = "";
  let dirkOrder = "";

  async function makeUser(label: string) {
    const user = await prisma.user.create({
      data: { name: `Laat annuleren ${label}`, email: `late-${tag}-${label}@student.kuleuven.be` },
    });
    userIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    await prisma.theokotSession.deleteMany({ where: { date: day } });
    const session = await prisma.theokotSession.create({
      data: {
        date: day,
        isOpen: true,
        orderOpenAt: brusselsWallClock(2032, 5, dayNumber, "00:00"),
        orderCloseAt,
        pickupStart,
        pickupEnd,
        items: {
          create: [
            { nameNl: "Kaas", priceCents: 260, quantity: 10, order: 0 },
            { nameNl: "Hesp", priceCents: 280, quantity: 10, order: 1 },
          ],
        },
      },
      include: { items: true },
    });
    sessionId = session.id;
    items.kaas = session.items.find((i) => i.nameNl === "Kaas")!.id;
    items.hesp = session.items.find((i) => i.nameNl === "Hesp")!.id;
    anna = await makeUser("anna");
    bram = await makeUser("bram");
    const order = await prisma.theokotOrder.create({
      data: {
        sessionId,
        userId: anna,
        totalCents: 2 * 260 + 280,
        lines: {
          create: [
            { sessionItemId: items.kaas, quantity: 2, unitPriceCents: 260 },
            { sessionItemId: items.hesp, quantity: 1, unitPriceCents: 280 },
          ],
        },
      },
    });
    annaOrder = order.id;
    const twoItems = async (label: string) =>
      (
        await prisma.theokotOrder.create({
          data: {
            sessionId,
            userId: await makeUser(label),
            totalCents: 260 + 280,
            lines: {
              create: [
                { sessionItemId: items.kaas, quantity: 1, unitPriceCents: 260 },
                { sessionItemId: items.hesp, quantity: 1, unitPriceCents: 280 },
              ],
            },
          },
        })
      ).id;
    carlOrder = await twoItems("carl");
    dirkOrder = await twoItems("dirk");
  });

  afterAll(async () => {
    if (sessionId) await prisma.theokotSession.delete({ where: { id: sessionId } });
    await prisma.theokotBan.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("verhuist alles naar de vrijgegeven broodjes en laat de voorraad ongemoeid", async () => {
    const before = await usageForSessionItems([items.kaas, items.hesp]);
    await releaseOrder(anna, annaOrder, during);

    const order = await prisma.theokotOrder.findUniqueOrThrow({
      where: { id: annaOrder },
      include: { lines: true, releases: true },
    });
    expect(order.status).toBe("RESERVED");
    expect(order.lines).toHaveLength(0);
    expect(order.totalCents).toBe(0);
    expect(order.releases.map((r) => [r.sessionItemId, r.quantity]).sort()).toEqual(
      [
        [items.kaas, 2],
        [items.hesp, 1],
      ].sort(),
    );
    expect(await usageForSessionItems([items.kaas, items.hesp])).toEqual(before);
  });

  it("schuift een kaas naar Bram, met een nieuwe bestelling", async () => {
    await takeOverSandwich(bram, items.kaas, during);

    const bramOrder = await prisma.theokotOrder.findUniqueOrThrow({
      where: { sessionId_userId: { sessionId, userId: bram } },
      include: { lines: true },
    });
    expect(bramOrder.lines.map((l) => [l.sessionItemId, l.quantity])).toEqual([[items.kaas, 1]]);
    expect(bramOrder.totalCents).toBe(260);
    const kaas = await prisma.theokotOrderRelease.findUniqueOrThrow({
      where: { orderId_sessionItemId: { orderId: annaOrder, sessionItemId: items.kaas } },
    });
    expect(kaas.quantity).toBe(1);
  });

  it("geeft Anna haar eigen kaas terug als ze er zelf een overneemt", async () => {
    await takeOverSandwich(anna, items.kaas, during);

    const order = await prisma.theokotOrder.findUniqueOrThrow({
      where: { id: annaOrder },
      include: { lines: true, releases: true },
    });
    expect(order.lines.map((l) => [l.sessionItemId, l.quantity])).toEqual([[items.kaas, 1]]);
    expect(order.totalCents).toBe(260);
    // Enkel de hesp staat nog vrij.
    expect(order.releases.map((r) => [r.sessionItemId, r.quantity])).toEqual([[items.hesp, 1]]);
  });

  it("weigert een tweede overname wanneer er niets meer vrij is", async () => {
    await expect(takeOverSandwich(bram, items.kaas, during)).rejects.toMatchObject({ code: "NOTHING_RELEASED" });
  });

  it("geeft een deel vrij: Carl houdt zijn kaas", async () => {
    const carl = (await prisma.theokotOrder.findUniqueOrThrow({ where: { id: carlOrder } })).userId;
    await releaseOrder(carl, carlOrder, during, [{ sessionItemId: items.hesp, quantity: 1 }]);
    const dirk = (await prisma.theokotOrder.findUniqueOrThrow({ where: { id: dirkOrder } })).userId;
    await releaseOrder(dirk, dirkOrder, during);

    const order = await prisma.theokotOrder.findUniqueOrThrow({
      where: { id: carlOrder },
      include: { lines: true, releases: true },
    });
    expect(order.lines.map((l) => [l.sessionItemId, l.quantity])).toEqual([[items.kaas, 1]]);
    expect(order.totalCents).toBe(260);
    expect(order.releases.map((r) => [r.sessionItemId, r.quantity])).toEqual([[items.hesp, 1]]);
  });

  it("geeft Anna een no-show voor de hesp, ook al haalde ze haar kaas op", async () => {
    await prisma.theokotOrder.update({
      where: { id: annaOrder },
      data: { status: "PICKED_UP", pickedUpAt: during },
    });
    await prisma.theokotOrder.update({
      where: { sessionId_userId: { sessionId, userId: bram } },
      data: { status: "PICKED_UP", pickedUpAt: during },
    });

    const result = await processSessionNoShows(sessionId, new Date(pickupEnd.getTime() + 3 * 3600000));
    // Anna (opgehaald, hesp bleef liggen), Carl (niets gehaald), Dirk (alles vrijgegeven).
    expect(result).toMatchObject({ success: true, noShows: 3 });

    const order = await prisma.theokotOrder.findUniqueOrThrow({
      where: { id: annaOrder },
      include: { lines: true, releases: true },
    });
    // Wat ze betaalde, blijft opgehaald; de hesp staat als verslag.
    expect(order.status).toBe("PICKED_UP");
    expect(order.releaseNoShowAt).not.toBeNull();
    expect(order.noShowProcessedAt).not.toBeNull();
    expect(order.lines.map((l) => [l.sessionItemId, l.quantity])).toEqual([[items.kaas, 1]]);
    expect(order.releases.map((r) => [r.sessionItemId, r.quantity])).toEqual([[items.hesp, 1]]);

    const bramOrder = await prisma.theokotOrder.findUniqueOrThrow({
      where: { sessionId_userId: { sessionId, userId: bram } },
    });
    expect(bramOrder.releaseNoShowAt).toBeNull();

    // Carl liet ook zijn eigen kaas liggen: een gewone no-show, met alles terug
    // op de lijnen.
    const carl = await prisma.theokotOrder.findUniqueOrThrow({
      where: { id: carlOrder },
      include: { lines: true, releases: true },
    });
    expect(carl.status).toBe("NO_SHOW");
    expect(carl.releaseNoShowAt).toBeNull();
    expect(carl.releases).toHaveLength(0);
    expect(carl.totalCents).toBe(540);

    // Dirk annuleerde alles: no-show met de markering, voor de eigen mail.
    const dirk = await prisma.theokotOrder.findUniqueOrThrow({
      where: { id: dirkOrder },
      include: { lines: true, releases: true },
    });
    expect(dirk.status).toBe("NO_SHOW");
    expect(dirk.releaseNoShowAt).not.toBeNull();
    expect(dirk.lines).toHaveLength(2);
    expect(dirk.releases).toHaveLength(0);
  });
});
