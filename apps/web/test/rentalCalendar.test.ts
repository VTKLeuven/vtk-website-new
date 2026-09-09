import { describe, expect, it } from "vitest";
import { buildRentalTimeSegments } from "@/app/[locale]/admin/theokot/verhuur/RentalCalendar";
import type { RentalView } from "@/app/[locale]/admin/theokot/verhuur/types";

function mockRental(overrides: Partial<RentalView> = {}): RentalView {
  return {
    id: "rental-1",
    day: "2026-10-07",
    minutes: 18 * 60,
    endMinutes: 26 * 60, // 02:00 next day
    dateInput: "2026-10-07",
    startInput: "18:00",
    endInput: "02:00",
    dateLabel: "woensdag 7 oktober 2026",
    dayLabel: "wo 7 okt",
    timeLabel: "18:00 – 02:00",
    status: "APPROVED",
    deposit: "TRANSFER",
    contract: "NVT",
    keyStatus: "PENDING",
    renterType: "INTERNAL",
    depositChoice: "TRANSFER",
    responsibleName: "Yana Possemiers",
    email: "yana@example.com",
    phone: "0499123456",
    purpose: "[Biomedix] Sportavond",
    attendees: 30,
    remarks: null,
    extraAnswers: [],
    internalNote: null,
    decisionNote: null,
    locale: "nl",
    decidedAtLabel: null,
    decidedByName: null,
    decidedViaMail: false,
    requesterNotifiedAtLabel: null,
    createdAtLabel: "7 okt 2026",
    clashes: [],
    messages: [],
    mailVars: {},
    ...overrides,
  };
}

describe("buildRentalTimeSegments", () => {
  it("splitst een overnacht-verhuur in een avond- en ochtenddeel", () => {
    const rental = mockRental({
      id: "overnight-1",
      day: "2026-10-07",
      minutes: 18 * 60, // 18:00
      endMinutes: 26 * 60, // 02:00 next day
    });

    const segments = buildRentalTimeSegments([rental]);

    const day1 = segments.get("2026-10-07");
    expect(day1).toBeDefined();
    expect(day1).toHaveLength(1);
    expect(day1![0]).toMatchObject({
      key: "overnight-1-start",
      day: "2026-10-07",
      minutes: 1080,
      endMinutes: 1440,
      isContinuation: false,
      rental,
    });

    const day2 = segments.get("2026-10-08");
    expect(day2).toBeDefined();
    expect(day2).toHaveLength(1);
    expect(day2![0]).toMatchObject({
      key: "overnight-1-cont",
      day: "2026-10-08",
      minutes: 0,
      endMinutes: 120, // 02:00
      isContinuation: true,
      rental,
    });
  });

  it("behoudt een gewone dagverhuur als enkel blok op dezelfde dag", () => {
    const rental = mockRental({
      id: "day-1",
      day: "2026-10-07",
      minutes: 14 * 60,
      endMinutes: 18 * 60,
    });

    const segments = buildRentalTimeSegments([rental]);

    const day1 = segments.get("2026-10-07");
    expect(day1).toHaveLength(1);
    expect(day1![0]).toMatchObject({
      key: "day-1-start",
      day: "2026-10-07",
      minutes: 840,
      endMinutes: 1080,
      isContinuation: false,
    });

    expect(segments.has("2026-10-08")).toBe(false);
  });

  it("splitst niet wanneer een verhuur exact om middernacht eindigt", () => {
    const rental = mockRental({
      id: "midnight-1",
      day: "2026-10-07",
      minutes: 20 * 60,
      endMinutes: 24 * 60,
    });

    const segments = buildRentalTimeSegments([rental]);

    const day1 = segments.get("2026-10-07");
    expect(day1).toHaveLength(1);
    expect(day1![0]).toMatchObject({
      minutes: 1200,
      endMinutes: 1440,
      isContinuation: false,
    });
    expect(segments.has("2026-10-08")).toBe(false);
  });

  it("schuift correct door over de maandgrens heen", () => {
    const rental = mockRental({
      id: "month-boundary",
      day: "2026-10-31",
      minutes: 21 * 60,
      endMinutes: 27 * 60, // 03:00 volgende ochtend
    });

    const segments = buildRentalTimeSegments([rental]);

    expect(segments.get("2026-10-31")![0].endMinutes).toBe(1440);
    const nov1 = segments.get("2026-11-01");
    expect(nov1).toBeDefined();
    expect(nov1![0]).toMatchObject({
      day: "2026-11-01",
      minutes: 0,
      endMinutes: 180,
      isContinuation: true,
    });
  });
});
