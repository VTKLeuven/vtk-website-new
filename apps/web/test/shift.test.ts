import { describe, expect, it } from "vitest";
import { academicYearRangeFor, currentAcademicYear, parseShift } from "@/lib/shift";

describe("shift wall-clock times", () => {
  it("interprets datetime-local values in Europe/Brussels", () => {
    const shift = parseShift({
      name: "Summer shift",
      startTime: "2027-07-15T12:00",
      endTime: "2027-07-15T14:00",
      location: "VTK",
      description: "Help out",
      maxParticipants: 2,
      reward: 1,
      post: null,
      openToInternationals: false,
      instructions: null,
    });

    expect(shift.startTime.toISOString()).toBe("2027-07-15T10:00:00.000Z");
    expect(shift.endTime.toISOString()).toBe("2027-07-15T12:00:00.000Z");
  });
});

describe("shift academic year cutover", () => {
  it("cuts over on 15 July (Europe/Brussels)", () => {
    expect(currentAcademicYear(new Date("2026-08-21T09:00:00Z"))).toBe(2026);
    expect(currentAcademicYear(new Date("2027-07-15T00:00:00+02:00"))).toBe(2027);
    expect(currentAcademicYear(new Date("2027-07-14T23:59:59+02:00"))).toBe(2026);
  });

  it("produces range from 15 July to 15 July", () => {
    const range = academicYearRangeFor(2026);
    expect(range.start.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2027-07-15T00:00:00.000Z");
  });
});
