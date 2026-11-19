import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";

// Getypeerd met de argumenten van de echte `sendMail`, zodat de test de mail kan lezen.
const sendMail = vi.hoisted(() =>
  vi.fn<(message: { to: string; subject: string; text: string }, options?: unknown) => Promise<boolean>>(
    async () => true,
  ),
);
vi.mock("@/lib/email", () => ({ sendMail, smtpConfigured: () => true }));

const { processDueSignupOpenedMails } = await import("@/lib/calendar/signupOpenedMailer");

/**
 * De mail "de ticketverkoop is open" tegen een echte database: de ruwe zeef in
 * de query, de voorverkoop per lid (posten van dit werkingsjaar) en de claim
 * die een tweede mail tegenhoudt. Dat zijn precies de stukken die een unit test
 * van `signupOpened.ts` niet ziet.
 */
describe("mail bij het opengaan van een ticketverkoop", () => {
  const ids = {
    group: randomUUID(),
    event: randomUUID(),
    sale: randomUUID(),
    praesidium: randomUUID(),
    student: randomUUID(),
    late: randomUUID(),
  };
  const now = new Date();
  const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
  const mailsTo = (userId: string) =>
    sendMail.mock.calls.filter(([message]) => message.to === `signup-${userId}@student.kuleuven.be`);

  beforeAll(async () => {
    await prisma.group.create({
      data: { id: ids.group, code: `so-${ids.group}`, slug: `so-${ids.group}`, nameNl: "T", nameEn: "T" },
    });
    for (const userId of [ids.praesidium, ids.student, ids.late]) {
      await prisma.user.create({
        data: {
          id: userId,
          name: "Test Lid",
          email: `signup-${userId}@student.kuleuven.be`,
          emailVerified: true,
          mailCategories: ["EVENEMENTEN"],
        },
      });
    }
    await prisma.groupMembership.create({
      data: { userId: ids.praesidium, groupId: ids.group, year: currentWorkingYear() },
    });
    await prisma.calendarEvent.create({
      data: {
        id: ids.event,
        slug: `so-${ids.event}`,
        titleNl: "Testcantus",
        start: minutes(14 * 24 * 60),
        end: minutes(14 * 24 * 60 + 240),
        groupId: ids.group,
        publishedAt: minutes(-3 * 24 * 60),
      },
    });
    // De voorverkoop liep een halfuur geleden aan; de publieke start is binnen
    // een halfuur.
    await prisma.ticketEvent.create({
      data: {
        id: ids.sale,
        calendarEventId: ids.event,
        ownerGroupId: ids.group,
        slug: `so-${ids.sale}`,
        titleNl: "Testcantus",
        startsAt: minutes(14 * 24 * 60),
        endsAt: minutes(14 * 24 * 60 + 240),
        status: "PUBLISHED",
        publishedAt: minutes(-2 * 24 * 60),
        salesStartAt: minutes(30),
        presaleLeadMinutes: 60,
      },
    });
    await prisma.calendarEventInterest.createMany({
      data: [
        { userId: ids.praesidium, eventId: ids.event, createdAt: minutes(-24 * 60) },
        { userId: ids.student, eventId: ids.event, createdAt: minutes(-24 * 60) },
        // Pas na de publieke start: die zag de knop al staan.
        { userId: ids.late, eventId: ids.event, createdAt: minutes(31) },
      ],
    });
  });

  afterAll(async () => {
    await prisma.calendarEvent.deleteMany({ where: { id: ids.event } });
    await prisma.ticketEvent.deleteMany({ where: { id: ids.sale } });
    await prisma.groupMembership.deleteMany({ where: { groupId: ids.group } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.praesidium, ids.student, ids.late] } } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
  });

  it("in de voorverkoop enkel naar wie erin mag", async () => {
    await processDueSignupOpenedMails(now);
    expect(mailsTo(ids.praesidium)).toHaveLength(1);
    expect(mailsTo(ids.praesidium)[0]![0].subject).toBe("Je voorverkoop voor Testcantus is begonnen");
    expect(mailsTo(ids.student)).toHaveLength(0);
  });

  it("bij de publieke start naar de rest, en niemand twee keer", async () => {
    sendMail.mockClear();
    await processDueSignupOpenedMails(minutes(35));
    expect(mailsTo(ids.student)).toHaveLength(1);
    expect(mailsTo(ids.student)[0]![0].subject).toBe("Tickets voor Testcantus zijn te koop");
    // Kreeg hem al in de voorverkoop.
    expect(mailsTo(ids.praesidium)).toHaveLength(0);
    expect(mailsTo(ids.late)).toHaveLength(0);

    await processDueSignupOpenedMails(minutes(40));
    expect(mailsTo(ids.student)).toHaveLength(1);
    expect(
      await prisma.calendarEventSignupMail.findMany({ where: { eventId: ids.event }, orderBy: { presale: "desc" } }),
    ).toMatchObject([
      { userId: ids.praesidium, source: `ticket:${ids.sale}`, presale: true },
      { userId: ids.student, source: `ticket:${ids.sale}`, presale: false },
    ]);
  });

  it("een mislukte verzending laat de claim los", async () => {
    await prisma.calendarEventSignupMail.deleteMany({ where: { userId: ids.student } });
    sendMail.mockResolvedValueOnce(false);
    await processDueSignupOpenedMails(minutes(45));
    expect(await prisma.calendarEventSignupMail.count({ where: { userId: ids.student } })).toBe(0);
  });
});
