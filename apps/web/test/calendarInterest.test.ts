import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * De drempel is de hele reden dat deze teller bestaat zoals ze bestaat: onder een
 * bepaald aantal leest een getal als "hier komt niemand" en houdt het precies de
 * mensen weg die het had moeten overtuigen. Een regressie hier is niet zichtbaar
 * in de UI tot iemand meldt dat er "3 komen" op de homepage staat.
 */
const groupBy = vi.fn();
const guestGroupBy = vi.fn();
const memberFindMany = vi.fn();
const guestFindMany = vi.fn();

vi.mock("@vtk/db", () => ({
  prisma: {
    calendarEventInterest: { groupBy, findMany: memberFindMany },
    calendarEventGuestInterest: { groupBy: guestGroupBy, findMany: guestFindMany },
  },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const {
  INTEREST_PUBLIC_THRESHOLD,
  attendeeList,
  adminAttendeeList,
  attendeesToCsv,
  interestLabel,
  publicInterestCounts,
  viewerInterests,
} = await import("@/lib/calendar/interest");

describe("publicInterestCounts", () => {
  beforeEach(() => {
    groupBy.mockReset();
    guestGroupBy.mockReset();
    memberFindMany.mockReset();
    guestFindMany.mockReset();
  });

  it("telt leden en gasten samen", async () => {
    groupBy.mockResolvedValue([{ eventId: "ev-1", _count: { _all: 20 } }]);
    guestGroupBy.mockResolvedValue([{ eventId: "ev-1", _count: { _all: 15 } }]);

    const counts = await publicInterestCounts(["ev-1"]);
    expect(counts.get("ev-1")).toBe(35);
  });

  it("laat een evenement onder de drempel volledig weg", async () => {
    groupBy.mockResolvedValue([
      { eventId: "laag", _count: { _all: INTEREST_PUBLIC_THRESHOLD - 1 } },
      { eventId: "net-genoeg", _count: { _all: INTEREST_PUBLIC_THRESHOLD } },
    ]);
    guestGroupBy.mockResolvedValue([]);

    const counts = await publicInterestCounts(["laag", "net-genoeg"]);
    // Niet "0" en niet "null met een getal ernaast": de rij bestaat gewoon niet,
    // zodat een laag aantal de server niet eens verlaat.
    expect(counts.has("laag")).toBe(false);
    expect(counts.get("net-genoeg")).toBe(INTEREST_PUBLIC_THRESHOLD);
  });

  it("doet geen enkele query voor een lege lijst", async () => {
    const counts = await publicInterestCounts([]);
    expect(counts.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
    expect(guestGroupBy).not.toHaveBeenCalled();
  });
});

describe("alumni-aanwezigheid per evenement", () => {
  beforeEach(() => {
    memberFindMany.mockReset();
    guestFindMany.mockReset();
  });

  it("leest de zelf ingevulde eventgegevens en niet het accountprofiel", async () => {
    memberFindMany.mockResolvedValue([
      {
        id: "member-interest",
        displayName: "Naam voor de reünie",
        graduationYear: 2007,
        wasInVtk: false,
        showName: true,
        showGraduationYear: true,
        showWasInVtk: true,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    ]);
    guestFindMany.mockResolvedValue([]);

    await expect(attendeeList("event-1")).resolves.toEqual([
      {
        key: "m-member-interest",
        name: "Naam voor de reünie",
        graduationYear: 2007,
        wasInVtk: false,
        showWasInVtk: true,
      },
    ]);
    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ user: expect.anything() }),
      }),
    );
  });

  it("houdt niet-aangevinkte gastgegevens uit de publieke lijst", async () => {
    memberFindMany.mockResolvedValue([]);
    guestFindMany.mockResolvedValue([
      {
        id: "guest-interest",
        displayName: "Privénaam",
        graduationYear: 2014,
        wasInVtk: true,
        showName: false,
        showGraduationYear: true,
        showWasInVtk: false,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    ]);

    await expect(attendeeList("event-1")).resolves.toEqual([
      {
        key: "g-guest-interest",
        name: null,
        graduationYear: 2014,
        wasInVtk: true,
        showWasInVtk: false,
      },
    ]);
  });

  it("levert de eigen alumnigegevens in één batch aan de kalendermodal", async () => {
    memberFindMany.mockResolvedValue([
      {
        eventId: "event-2",
        displayName: "J. Peeters",
        graduationYear: 2004,
        wasInVtk: true,
        showName: true,
        showGraduationYear: false,
        showWasInVtk: true,
      },
    ]);

    const rows = await viewerInterests(["event-1", "event-2"], "user-1");
    expect(rows.get("event-1")).toBeUndefined();
    expect(rows.get("event-2")).toEqual({
      kind: "member",
      displayName: "J. Peeters",
      graduationYear: 2004,
      wasInVtk: true,
      showName: true,
      showGraduationYear: false,
      showWasInVtk: true,
    });
  });
});

describe("interestLabel", () => {
  it("zwijgt bij niets, nul of undefined", () => {
    expect(interestLabel(null, "nl")).toBeNull();
    expect(interestLabel(0, "nl")).toBeNull();
    expect(interestLabel(undefined, "nl")).toBeNull();
  });

  it("schrijft het aantal uit in beide talen", () => {
    expect(interestLabel(32, "nl")).toBe("32 komen");
    expect(interestLabel(32, "en")).toBe("32 going");
  });
});

describe("adminAttendeeList en CSV export", () => {
  beforeEach(() => {
    memberFindMany.mockReset();
    guestFindMany.mockReset();
  });

  it("geeft alle geïnteresseerden (leden en gasten) terug voor de beheerder", async () => {
    const t1 = new Date("2026-08-20T10:00:00Z");
    const t2 = new Date("2026-08-21T12:00:00Z");

    memberFindMany.mockResolvedValue([
      {
        id: "mem-1",
        displayName: "Jeroen Peeters",
        graduationYear: 2020,
        wasInVtk: true,
        showName: false,
        showGraduationYear: false,
        showWasInVtk: false,
        createdAt: t1,
        user: {
          id: "usr-1",
          name: "Jeroen Peeters",
          firstName: "Jeroen",
          lastName: "Peeters",
          email: "jeroen@example.com",
          rNumber: "r0123456",
          alumni: true,
          firwStudent: false,
          graduationYear: 2019,
          wasInVtk: false,
          alumniMailOptIn: true,
        },
      },
    ]);

    guestFindMany.mockResolvedValue([
      {
        id: "gst-1",
        displayName: "Gast Bezoeker",
        graduationYear: 2010,
        wasInVtk: false,
        showName: true,
        showGraduationYear: true,
        showWasInVtk: false,
        createdAt: t2,
      },
    ]);

    const result = await adminAttendeeList("event-xyz");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "mem-1",
      kind: "member",
      userId: "usr-1",
      name: "Jeroen Peeters",
      email: "jeroen@example.com",
      rNumber: "r0123456",
      isAlumni: true,
      graduationYear: 2020,
      effectiveGraduationYear: 2020,
      wasInVtk: true,
      effectiveWasInVtk: true,
      showName: false,
      createdAt: t1,
    });
    expect(result[1]).toMatchObject({
      id: "gst-1",
      kind: "guest",
      userId: null,
      name: "Gast Bezoeker",
      email: null,
      rNumber: null,
      isAlumni: false,
      graduationYear: 2010,
      effectiveGraduationYear: 2010,
      wasInVtk: false,
      effectiveWasInVtk: false,
      showName: true,
      createdAt: t2,
    });
  });

  it("genereert een geldige CSV string met headers", () => {
    const rows = [
      {
        id: "mem-1",
        kind: "member" as const,
        userId: "usr-1",
        name: "Jeroen Peeters",
        email: "jeroen@example.com",
        rNumber: "r0123456",
        isAlumni: true,
        firwStudent: false,
        profileGraduationYear: 2019,
        profileWasInVtk: false,
        alumniMailOptIn: true,
        displayName: null,
        graduationYear: 2020,
        effectiveGraduationYear: 2020,
        wasInVtk: true,
        effectiveWasInVtk: true,
        showName: true,
        showGraduationYear: true,
        showWasInVtk: false,
        createdAt: new Date("2026-08-20T10:00:00Z"),
      },
    ];

    const csv = attendeesToCsv(rows, "nl");
    expect(csv).toContain("Type,Naam,E-mail,KU Leuven r-nummer");
    expect(csv).toContain("Account,Jeroen Peeters,jeroen@example.com,r0123456");
    expect(csv).toContain("Ja (naam, afstudeerjaar)");
  });
});

