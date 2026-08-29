import { describe, expect, it } from "vitest";
import {
  monthGridCells,
  rollingSixWeeksGridCells,
  weekGridDays,
} from "@/components/editorial/calendarGrid";

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

describe("rolling six weeks grid", () => {
  it("generates 42 days covering 1 week back, current week, and 4 weeks ahead", () => {
    // Wednesday 26 August 2026
    const anchor = new Date(2026, 7, 26);
    const cells = rollingSixWeeksGridCells(anchor);

    expect(cells).toHaveLength(42);
    expect(cells.every((c) => c.inMonth)).toBe(true);

    // Week 1 (previous week): Monday 17 Aug - Sunday 23 Aug
    expect(cells[0].date).toEqual(new Date(2026, 7, 17));
    expect(cells[6].date).toEqual(new Date(2026, 7, 23));

    // Week 2 (current week containing anchor): Monday 24 Aug - Sunday 30 Aug
    expect(cells[7].date).toEqual(new Date(2026, 7, 24));
    expect(cells[13].date).toEqual(new Date(2026, 7, 30));

    // Week 6 (4th upcoming week): Monday 21 Sep - Sunday 27 Sep
    expect(cells[35].date).toEqual(new Date(2026, 8, 21));
    expect(cells[41].date).toEqual(new Date(2026, 8, 27));
  });

  it("works across year transitions", () => {
    // Friday 1 January 2027
    const anchor = new Date(2027, 0, 1);
    const cells = rollingSixWeeksGridCells(anchor);

    expect(cells).toHaveLength(42);
    // Week 1 (previous week): Mon 21 Dec 2026
    expect(cells[0].date).toEqual(new Date(2026, 11, 21));
    // Week 2 (current week): Mon 28 Dec 2026
    expect(cells[7].date).toEqual(new Date(2026, 11, 28));
    // Week 6 (+4 weeks): Sun 31 Jan 2027
    expect(cells[41].date).toEqual(new Date(2027, 0, 31));
  });
});
