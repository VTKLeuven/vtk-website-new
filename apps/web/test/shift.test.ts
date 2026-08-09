import { describe, expect, it } from "vitest";
import { parseShift } from "@/lib/shift";

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
