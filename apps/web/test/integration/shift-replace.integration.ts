import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: session.userId } })),
  requirePermission: vi.fn(async () => undefined),
  authErrorResponse: () => new Response(null, { status: 401 }),
}));
// Getypeerd met de argumenten van de echte `sendMail`, zodat de test de mail kan lezen.
const sendMail = vi.hoisted(() =>
  vi.fn<(message: { to: string; subject: string }, options?: unknown) => Promise<boolean>>(
    async () => true,
  ),
);
vi.mock("@/lib/email", () => ({ sendMail, smtpConfigured: () => true }));

const { POST, PATCH } = await import("@/app/api/shift/register/route");

describe("vervangbaar op een shift", () => {
  const ids = {
    praeses: randomUUID(),
    otherPraesidium: randomUUID(),
    student: randomUUID(),
    group: randomUUID(),
    shift: randomUUID(),
  };

  const register = (userId: string, replaceable = false) => {
    session.userId = userId;
    return POST(
      new Request(
        `http://localhost/api/shift/register?id=${ids.shift}${replaceable ? "&replaceable=1" : ""}`,
        { method: "POST" },
      ),
    );
  };
  const participants = () =>
    prisma.shiftParticipant.findMany({
      where: { shiftId: ids.shift },
      select: { userId: true, replaceable: true },
    });

  beforeAll(async () => {
    for (const [id, name] of [
      [ids.praeses, "Praeses Test"],
      [ids.otherPraesidium, "Ander Praesidium"],
      [ids.student, "Student Test"],
    ] as const) {
      await prisma.user.create({ data: { id, name, email: `${id}@example.test`, active: true } });
    }
    await prisma.group.create({
      data: {
        id: ids.group,
        code: `replace-${ids.group}`,
        slug: `replace-${ids.group}`,
        nameNl: "Testpost",
        nameEn: "Test post",
        type: "PRAESIDIUM",
      },
    });
    const year = currentWorkingYear();
    await prisma.groupMembership.createMany({
      data: [
        { userId: ids.praeses, groupId: ids.group, year },
        { userId: ids.otherPraesidium, groupId: ids.group, year },
      ],
    });
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.shift.create({
      data: {
        id: ids.shift,
        name: "Vervangtest",
        startTime: start,
        endTime: new Date(start.getTime() + 3 * 60 * 60 * 1000),
        location: "Fakbar",
        description: "",
        maxParticipants: 1,
        reward: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.shift.deleteMany({ where: { id: ids.shift } });
    await prisma.groupMembership.deleteMany({ where: { groupId: ids.group } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.praeses, ids.otherPraesidium, ids.student] } } });
    await prisma.$disconnect();
  });

  it("laat een praesidiumlid zich vervangbaar inschrijven", async () => {
    expect((await register(ids.praeses, true)).status).toBe(201);
    expect(await participants()).toEqual([{ userId: ids.praeses, replaceable: true }]);
  });

  it("laat een ander praesidiumlid die plaats niet innemen", async () => {
    expect((await register(ids.otherPraesidium)).status).toBe(409);
    expect(await participants()).toEqual([{ userId: ids.praeses, replaceable: true }]);
  });

  it("laat een student de plaats innemen en mailt het praesidiumlid", async () => {
    expect((await register(ids.student)).status).toBe(201);
    expect(await participants()).toEqual([{ userId: ids.student, replaceable: false }]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      to: `${ids.praeses}@example.test`,
      subject: "Je hoeft niet meer te komen: Vervangtest",
    });
  });

  it("negeert de vlag van wie geen praesidium is, en zet ze enkel voor het praesidium", async () => {
    session.userId = ids.student;
    const refused = await PATCH(
      new Request(`http://localhost/api/shift/register?id=${ids.shift}`, {
        method: "PATCH",
        body: JSON.stringify({ replaceable: true }),
      }),
    );
    expect(refused.status).toBe(403);
    expect(await participants()).toEqual([{ userId: ids.student, replaceable: false }]);
  });
});
