import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { brusselsWallClock } from "@/lib/brussels";
import {
  rebalanceMeetingSupply,
  releaseBigBureau,
  syncMeetingReservations,
  usageForSessionItems,
} from "@/lib/meetings-server";

/**
 * Big bureau tegen een echte database. Het geval dat ertoe doet: een bureau dat
 * al Theokot-broodjes vasthoudt en waarvoor big bureau pas achteraf aangezet
 * wordt. Wat boven de limiet valt, moet dan terug vrij komen voor studenten, en
 * uitzetten mag nooit meer van de voorraad nemen dan er is.
 */
describe.sequential("big bureau", () => {
  const tag = randomUUID().slice(0, 8);
  // Een dag ver in de toekomst, uniek per run: `TheokotSession.date` is uniek.
  const dayNumber = 1 + (parseInt(tag.slice(0, 4), 16) % 28);
  const day = brusselsWallClock(2031, 3, dayNumber, "00:00");
  const userIds: string[] = [];
  let sessionId = "";
  let meetingId = "";
  const items = { kaas: "", kip: "" };
  const reservations: string[] = [];
  // De bureauvoorraad is een globale setting: wat er stond, zet afterAll terug.
  let bureauStockBefore: { value: unknown } | null = null;

  async function makeUser(label: string) {
    const user = await prisma.user.create({
      data: { name: `Big bureau ${label}`, email: `bigbureau-${tag}-${label}@student.kuleuven.be` },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function studentOrder(label: string, itemId: string, quantity: number) {
    await prisma.theokotOrder.create({
      data: {
        sessionId,
        userId: await makeUser(label),
        totalCents: quantity * 260,
        lines: { create: [{ sessionItemId: itemId, quantity, unitPriceCents: 260 }] },
      },
    });
  }

  async function split() {
    const rows = await prisma.meetingReservation.findMany({
      where: { meetingId },
      select: { id: true, external: true, sessionItemId: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return reservations.map((id) => byId.get(id)!);
  }

  beforeAll(async () => {
    bureauStockBefore = await prisma.setting.findUnique({ where: { key: "theokot.bureauStock" } });
    await prisma.theokotSession.deleteMany({ where: { date: day } });
    const session = await prisma.theokotSession.create({
      data: {
        date: day,
        orderOpenAt: brusselsWallClock(2031, 3, dayNumber, "08:00"),
        orderCloseAt: brusselsWallClock(2031, 3, dayNumber, "10:30"),
        pickupStart: brusselsWallClock(2031, 3, dayNumber, "12:00"),
        pickupEnd: brusselsWallClock(2031, 3, dayNumber, "13:30"),
        items: {
          create: [
            { nameNl: "Broodje kaas", priceCents: 260, quantity: 5, order: 0 },
            { nameNl: "Broodje kip", priceCents: 300, quantity: 5, order: 1 },
          ],
        },
      },
      include: { items: true },
    });
    sessionId = session.id;
    items.kaas = session.items.find((item) => item.nameNl === "Broodje kaas")!.id;
    items.kip = session.items.find((item) => item.nameNl === "Broodje kip")!.id;

    const meeting = await prisma.meeting.create({
      data: {
        kind: "BUREAU",
        year: 2030,
        semester: 2,
        slug: `bureau-test-${tag}`,
        startsAt: brusselsWallClock(2031, 3, dayNumber, "12:40"),
      },
    });
    meetingId = meeting.id;

    // Twee studenten nemen kaas, daarna schrijft het bureau zich in zoals vroeger:
    // elk broodje meteen aan de voorraad gekoppeld. Kaas is dan uitverkocht.
    await studentOrder("student-1", items.kaas, 2);
    const wanted: Array<[string, string]> = [
      ["Broodje kaas", items.kaas],
      ["Broodje kaas", items.kaas],
      ["Broodje kip", items.kip],
      ["Broodje kaas", items.kaas],
      ["Broodje kip", items.kip],
      ["Broodje kip", items.kip],
    ];
    for (const [index, [name, itemId]] of wanted.entries()) {
      const reservation = await prisma.meetingReservation.create({
        data: {
          meetingId,
          userId: await makeUser(`bureau-${index + 1}`),
          itemNameNl: name,
          itemPriceCents: 260,
          sessionItemId: itemId,
          createdAt: new Date(Date.UTC(2031, 0, 1, 12, index)),
        },
      });
      reservations.push(reservation.id);
    }
  });

  afterAll(async () => {
    if (bureauStockBefore) {
      await prisma.setting.update({
        where: { key: "theokot.bureauStock" },
        data: { value: bureauStockBefore.value as object },
      });
    } else {
      await prisma.setting.deleteMany({ where: { key: "theokot.bureauStock" } });
    }
    if (meetingId) await prisma.meeting.deleteMany({ where: { id: meetingId } });
    if (sessionId) await prisma.theokotSession.deleteMany({ where: { id: sessionId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("aanzetten met bestaande bestellingen geeft wat boven de limiet valt terug aan de studenten", async () => {
    expect((await usageForSessionItems([items.kaas])).get(items.kaas)).toBe(5);

    await prisma.meeting.update({ where: { id: meetingId }, data: { theokotLimit: 2 } });
    await syncMeetingReservations(meetingId);

    const rows = await split();
    expect(rows.map((row) => row.external)).toEqual([false, false, true, true, true, true]);
    expect(rows[0].sessionItemId).toBe(items.kaas);
    expect(rows[1].sessionItemId).toBe(items.kaas);
    expect(rows.slice(2).every((row) => row.sessionItemId === null)).toBe(true);

    // Kaas: twee studenten plus de eerste twee van het bureau. Kip: niets meer.
    const used = await usageForSessionItems([items.kaas, items.kip]);
    expect(used.get(items.kaas)).toBe(4);
    expect(used.get(items.kip) ?? 0).toBe(0);
  });

  it("een hogere limiet neemt enkel wat Theokot nog vrij heeft", async () => {
    // Intussen nemen studenten vier van de vijf kip.
    await studentOrder("student-2", items.kip, 4);

    await prisma.meeting.update({ where: { id: meetingId }, data: { theokotLimit: 10 } });
    await syncMeetingReservations(meetingId);

    const rows = await split();
    // r3 krijgt de laatste kip, r4 de laatste kaas; r5 en r6 (kip) blijven extern.
    expect(rows.map((row) => row.external)).toEqual([false, false, false, false, true, true]);
    expect(rows[2].sessionItemId).toBe(items.kip);
    expect(rows[3].sessionItemId).toBe(items.kaas);

    const used = await usageForSessionItems([items.kaas, items.kip]);
    expect(used.get(items.kaas)).toBe(5);
    expect(used.get(items.kip)).toBe(5);
  });

  it("uitzetten telt wat Theokot niet kan overnemen, zodat de action kan weigeren", async () => {
    const before = await split();
    const attempt = prisma.$transaction(async (tx) => {
      const result = await rebalanceMeetingSupply(tx, meetingId, { limit: null });
      // Zo rolt `saveMeetingAction` terug wanneer er iets extern blijft.
      if (result.external > 0) throw new Error(`EXTERNAL_LEFT:${result.external}`);
    });
    await expect(attempt).rejects.toThrow("EXTERNAL_LEFT:2");
    expect(await split()).toEqual(before);
  });

  it("een annulatie bij Theokot maakt plaats voor de eerstvolgende die extern stond", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.meetingReservation.delete({ where: { id: reservations[2] } });
      await rebalanceMeetingSupply(tx, meetingId);
    });
    reservations.splice(2, 1);

    const rows = await split();
    // De kip van de geannuleerde gaat naar de vroegste kip die extern stond.
    expect(rows.map((row) => row.external)).toEqual([false, false, false, false, true]);
    expect(rows[3].sessionItemId).toBe(items.kip);
  });

  it("uitzetten neemt wat de gewone voorraad niet kan uit de bureauvoorraad", async () => {
    async function setBureauStock(extraSandwiches: number) {
      await prisma.setting.upsert({
        where: { key: "theokot.bureauStock" },
        update: { value: { extraSandwiches } },
        create: { key: "theokot.bureauStock", value: { extraSandwiches } },
      });
    }
    // Zoals `saveMeetingAction`: eerst de limiet weg, dan vrijgeven, en terugrollen
    // wanneer er iets extern blijft.
    const release = () =>
      prisma.$transaction(async (tx) => {
        await tx.meeting.update({ where: { id: meetingId }, data: { theokotLimit: null } });
        const left = await releaseBigBureau(tx, meetingId);
        if (left > 0) throw new Error(`EXTERNAL_LEFT:${left}`);
      });

    // Nog één kip extern, en kip is op voor studenten.
    const before = await split();
    expect(before.map((row) => row.external)).toEqual([false, false, false, false, true]);

    await setBureauStock(0);
    await expect(release()).rejects.toThrow("EXTERNAL_LEFT:1");
    expect(await split()).toEqual(before);

    await setBureauStock(1);
    await release();
    const last = await prisma.meetingReservation.findUniqueOrThrow({
      where: { id: reservations[4] },
      select: { external: true, extra: true, sessionItemId: true },
    });
    expect(last).toEqual({ external: false, extra: true, sessionItemId: items.kip });
    // Een broodje uit de bureauvoorraad gaat niet van de voorraad voor studenten af.
    expect((await usageForSessionItems([items.kip])).get(items.kip)).toBe(5);
  });
});
