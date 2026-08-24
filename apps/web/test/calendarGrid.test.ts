import { describe, expect, it } from "vitest";
import { weekGridDays } from "@/components/editorial/calendarGrid";

describe("calendar week grid", () => {
  it("returns the Monday-to-Sunday week around the selected day", () => {
    const days = weekGridDays(new Date(2026, 7, 23));
    expect(days.map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(days[0]).toEqual(new Date(2026, 7, 17));
    expect(days[6]).toEqual(new Date(2026, 7, 23));
  });

  it("crosses month and year boundaries", () => {
    const days = weekGridDays(new Date(2027, 0, 1));
    expect(days[0]).toEqual(new Date(2026, 11, 28));
    expect(days[6]).toEqual(new Date(2027, 0, 3));
  });
});
