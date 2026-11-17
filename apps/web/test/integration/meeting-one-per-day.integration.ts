import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import { SAVE_IDLE } from "@/lib/saveState";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: session.userId } })),
  requirePermission: vi.fn(async () => ({ user: { id: session.userId } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const { createMeetingAction, planMeetingsAction } = await import("@/app/actions/meetings");

/**
 * Eén bureau en één grocomeet per dag (`@@unique([kind, day])`). Op productie
 * stond elk bureau van semester 1 dubbel: de planner hield na het wisselen van
 * semestertab de dagen van semester 1 vast, en opslaan zette ze er onder
 * semester 2 een tweede keer in. Twee opslagen tegelijk zijn de andere weg.
 */
describe("één vergadering per soort per dag", () => {
  const tag = randomUUID().slice(0, 8);
  // Een jaar zonder echte vergaderingen, uniek per run.
  const year = 2070 + (parseInt(tag.slice(0, 2), 16) % 20);
  const days = [`${year}-10-01`, `${year}-10-08`, `${year}-10-15`];

  function planForm() {
    const data = new FormData();
    data.set("kind", "BUREAU");
    data.set("year", String(year));
    data.set("semester", "1");
    data.set("dayCount", String(days.length));
    days.forEach((day, i) => {
      data.set(`day-${i}-date`, day);
      data.set(`day-${i}-time`, "12:30");
    });
    return data;
  }

  const meetingsOfYear = () =>
    prisma.meeting.findMany({ where: { year: { in: [year, year + 1] } }, orderBy: { startsAt: "asc" } });

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: `Eén per dag ${tag}`, email: `een-per-dag-${tag}@student.kuleuven.be` },
    });
    session.userId = user.id;
  });

  afterAll(async () => {
    await prisma.meeting.deleteMany({ where: { year: { in: [year, year + 1] } } });
    await prisma.meetingPlan.deleteMany({ where: { year } });
    if (session.userId) await prisma.user.deleteMany({ where: { id: session.userId } });
  });

  it("twee keer tegelijk plannen geeft elke dag één keer", async () => {
    const results = await Promise.all([planMeetingsAction(SAVE_IDLE, planForm()), planMeetingsAction(SAVE_IDLE, planForm())]);
    expect(results.map((result) => result.status)).toEqual(["success", "success"]);
    const meetings = await meetingsOfYear();
    expect(meetings.map((meeting) => meeting.slug)).toEqual(days.map((day) => `bureau-${day}`));
  });

  it("weigert dagen van een ander semester, zoals de dubbels op productie", async () => {
    // Op productie zette de planning van semester 2 de dagen van semester 1 er
    // een tweede keer in: de planner hield ze na het wisselen van tab vast.
    const data = planForm();
    data.set("semester", "2");
    const before = await meetingsOfYear();
    expect(await planMeetingsAction(SAVE_IDLE, data)).toMatchObject({ status: "error", code: "DAY_OUTSIDE_SEMESTER" });
    expect(await meetingsOfYear()).toHaveLength(before.length);
  });

  it("een tweede bureau op dezelfde dag toevoegen zegt dat de dag bezet is", async () => {
    const data = new FormData();
    data.set("kind", "BUREAU");
    data.set("year", String(year));
    data.set("startsAt", `${days[0]}T19:00`);
    expect(await createMeetingAction(SAVE_IDLE, data)).toMatchObject({ status: "error", code: "DAY_TAKEN" });
  });

  it("een grocomeet op de dag van een bureau mag wel", async () => {
    const data = new FormData();
    data.set("kind", "GROCOMEET");
    data.set("year", String(year));
    data.set("startsAt", `${days[0]}T12:45`);
    expect(await createMeetingAction(SAVE_IDLE, data)).toMatchObject({ status: "success" });
  });
});
