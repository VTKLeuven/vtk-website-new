import { describe, expect, it } from "vitest";
import { layoutDayEvents } from "@/lib/calendarLayout";

describe("layoutDayEvents", () => {
  it("geeft een lege lijst terug voor lege invoer", () => {
    expect(layoutDayEvents([])).toEqual([]);
  });

  it("geeft lane 0 en lanes 1 voor één evenement", () => {
    const events = [{ minutes: 540, endMinutes: 600, id: "a" }];
    const placed = layoutDayEvents(events);
    expect(placed).toEqual([{ minutes: 540, endMinutes: 600, id: "a", lane: 0, lanes: 1 }]);
  });

  it("plaatst niet-overlappende evenementen op lane 0 met lanes 1", () => {
    const events = [
      { minutes: 540, endMinutes: 600, id: "a" },
      { minutes: 660, endMinutes: 720, id: "b" },
    ];
    const placed = layoutDayEvents(events);
    expect(placed).toEqual([
      { minutes: 540, endMinutes: 600, id: "a", lane: 0, lanes: 1 },
      { minutes: 660, endMinutes: 720, id: "b", lane: 0, lanes: 1 },
    ]);
  });

  it("plaatst twee tegelijk startende evenementen in twee verschillende banen", () => {
    const events = [
      { minutes: 570, endMinutes: 630, id: "a" },
      { minutes: 570, endMinutes: 630, id: "b" },
    ];
    const placed = layoutDayEvents(events);
    expect(placed).toEqual([
      { minutes: 570, endMinutes: 630, id: "a", lane: 0, lanes: 2 },
      { minutes: 570, endMinutes: 630, id: "b", lane: 1, lanes: 2 },
    ]);
  });

  it("houdt rekening met minimale visuele duur bij overlapdetectie", () => {
    // Twee lesbezoeken van 5 minuten: 09:00 (540) en 09:30 (570).
    // Met minDurationMinutes = 35 overlapt 540-575 met 570.
    const events = [
      { minutes: 540, endMinutes: 545, id: "a" },
      { minutes: 570, endMinutes: 575, id: "b" },
    ];
    const placed = layoutDayEvents(events, 35);
    expect(placed).toEqual([
      { minutes: 540, endMinutes: 545, id: "a", lane: 0, lanes: 2 },
      { minutes: 570, endMinutes: 575, id: "b", lane: 1, lanes: 2 },
    ]);
  });

  it("scheidt clusters correct: evenement na cluster krijgt opnieuw volledige breedte", () => {
    const events = [
      { minutes: 570, endMinutes: 630, id: "a" },
      { minutes: 570, endMinutes: 630, id: "b" },
      { minutes: 700, endMinutes: 760, id: "c" },
    ];
    const placed = layoutDayEvents(events);
    expect(placed).toEqual([
      { minutes: 570, endMinutes: 630, id: "a", lane: 0, lanes: 2 },
      { minutes: 570, endMinutes: 630, id: "b", lane: 1, lanes: 2 },
      { minutes: 700, endMinutes: 760, id: "c", lane: 0, lanes: 1 },
    ]);
  });

  it("hergebruikt een vrije baan binnen een cluster", () => {
    // a duurt van 500 tot 700 (lane 0)
    // b duurt van 500 tot 550 (lane 1)
    // c duurt van 560 tot 600 (kan lane 1 hergebruiken!)
    const events = [
      { minutes: 500, endMinutes: 700, id: "a" },
      { minutes: 500, endMinutes: 550, id: "b" },
      { minutes: 560, endMinutes: 600, id: "c" },
    ];
    const placed = layoutDayEvents(events);
    expect(placed).toEqual([
      { minutes: 500, endMinutes: 700, id: "a", lane: 0, lanes: 2 },
      { minutes: 500, endMinutes: 550, id: "b", lane: 1, lanes: 2 },
      { minutes: 560, endMinutes: 600, id: "c", lane: 1, lanes: 2 },
    ]);
  });
});
