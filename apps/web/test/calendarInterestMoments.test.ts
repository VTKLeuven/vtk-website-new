import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Interesse per dag van een evenement met losse momenten (een loopweek met elke
 * dag een loopje).
 *
 * Wat hier bewaakt wordt, is de grens tussen "ik kom naar deze reeks" en "ik kom
 * woensdag": de ster in het weekoverzicht en op de eventpagina staat per dag, de
 * ster op een kaart die de hele reeks toont zet ze alle samen. Gaat dat mis, dan
 * merkt niemand het aan een foutmelding maar staat er stil een markering voor de
 * verkeerde avond, of voor een avond die niet bestaat.
 */

const upsert = vi.fn();
const deleteMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const momentFindMany = vi.fn();
const eventCount = vi.fn();

vi.mock("@vtk/db", () => ({
  prisma: {
    calendarEventInterest: { upsert, deleteMany, findFirst, create, update },
    calendarEventMoment: { findMany: momentFindMany },
    calendarEvent: { count: eventCount },
    calendarEventGuestInterest: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getCurrentSession: async () => ({ user: { id: "u-1" } }),
}));

const { setEventInterestAction } = await import("@/app/actions/eventInterest");
const { SAVE_IDLE } = await import("@/lib/saveState");

const LOOPJE_3 = new Date("2026-09-20T18:00:00.000Z");
const LOOPJE_4 = new Date("2026-09-21T18:00:00.000Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("setEventInterestAction met momenten", () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({});
    deleteMany.mockReset().mockResolvedValue({ count: 1 });
    findFirst.mockReset().mockResolvedValue(null);
    create.mockReset().mockResolvedValue({});
    update.mockReset().mockResolvedValue({});
    momentFindMany.mockReset().mockResolvedValue([{ start: LOOPJE_3 }, { start: LOOPJE_4 }]);
    // Zichtbaar evenement, geen alumni-doelgroep.
    eventCount.mockReset().mockResolvedValueOnce(1).mockResolvedValue(0);
  });

  it("schrijft enkel de dag die is aangeduid", async () => {
    const result = await setEventInterestAction(
      SAVE_IDLE,
      form({ eventId: "loopweek", momentStart: LOOPJE_4.toISOString() }),
    );

    expect(result.status).toBe("success");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0].where.userId_eventId_momentStart).toEqual({
      userId: "u-1",
      eventId: "loopweek",
      momentStart: LOOPJE_4,
    });
  });

  it("weigert een dag die dit evenement niet heeft", async () => {
    const result = await setEventInterestAction(
      SAVE_IDLE,
      form({ eventId: "loopweek", momentStart: "2026-12-24T18:00:00.000Z" }),
    );

    // Anders staat er een markering voor een avond die niet bestaat, en die
    // krijgt niemand er ooit nog af.
    expect(result).toMatchObject({ status: "error", code: "NOT_FOUND" });
    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("zet zonder dag de hele reeks aan", async () => {
    const result = await setEventInterestAction(SAVE_IDLE, form({ eventId: "loopweek" }));

    expect(result.status).toBe("success");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(
      upsert.mock.calls.map((call) => call[0].where.userId_eventId_momentStart.momentStart),
    ).toEqual([LOOPJE_3, LOOPJE_4]);
  });

  it("haalt bij het uitzetten van één dag de andere dagen niet weg", async () => {
    await setEventInterestAction(
      SAVE_IDLE,
      form({ eventId: "loopweek", momentStart: LOOPJE_3.toISOString(), interested: "off" }),
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "u-1", eventId: "loopweek", momentStart: LOOPJE_3 },
    });
  });

  it("haalt zonder dag alles van dit evenement weg", async () => {
    await setEventInterestAction(SAVE_IDLE, form({ eventId: "loopweek", interested: "off" }));

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1", eventId: "loopweek" } });
  });

  it("schrijft bij een evenement zonder momenten één rij zonder dag", async () => {
    momentFindMany.mockResolvedValue([]);

    const result = await setEventInterestAction(SAVE_IDLE, form({ eventId: "cantus" }));

    expect(result.status).toBe("success");
    // Geen upsert: `momentStart` zit in de unieke sleutel, en Postgres ziet twee
    // NULL's als verschillend, dus een upsert zou nooit de bestaande rij vinden.
    expect(upsert).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u-1", eventId: "cantus" }),
    });
  });

  it("maakt geen tweede rij wanneer hetzelfde twee keer wordt aangeduid", async () => {
    momentFindMany.mockResolvedValue([]);
    findFirst.mockResolvedValue({ id: "bestaande-rij" });

    await setEventInterestAction(SAVE_IDLE, form({ eventId: "cantus" }));

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "bestaande-rij" } }),
    );
  });
});
