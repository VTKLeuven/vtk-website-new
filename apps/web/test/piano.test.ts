import { describe, expect, it } from "vitest";
import { isoWeekKey, parseYMD } from "@/lib/brussels";
import {
  findPianoSlot,
  generatePianoDays,
  isPianoSlotBookable,
  parsePianoConfig,
  pianoWeekRange,
  type PianoWindowRule,
} from "@/lib/piano";

const ymd = (value: string) => parseYMD(value)!;

/** De avondregeling van het academiejaar: ma, di, do van 19u tot 22u. */
const EVENINGS: PianoWindowRule = {
  weekdays: [1, 2, 4],
  startMinute: 19 * 60,
  endMinute: 22 * 60,
  startDate: null,
  endDate: null,
};

/** Brussel-wandklok van een slot, om de DST-correctheid te kunnen nalezen. */
const wallClock = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

describe("generatePianoDays", () => {
  it("splits a window into slots and skips the weekdays it does not cover", () => {
    // Maandag 5 tot zondag 11 oktober 2026.
    const days = generatePianoDays([EVENINGS], [], {
      from: ymd("2026-10-05"),
      to: ymd("2026-10-11"),
      slotMinutes: 60,
    });

    expect(days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-08"]);
    expect(days[0].slots.map((s) => wallClock(s.startsAt))).toEqual(["19:00", "20:00", "21:00"]);
    expect(wallClock(days[0].slots[2].endsAt)).toBe("22:00");
  });

  it("leaves the remainder of a window alone instead of running past its end", () => {
    const [day] = generatePianoDays([EVENINGS], [], {
      from: ymd("2026-10-05"),
      to: ymd("2026-10-05"),
      slotMinutes: 45,
    });

    // 19:00-22:00 met slots van 45 minuten: vier slots, de laatste eindigt op 22:00.
    expect(day.slots.map((s) => wallClock(s.startsAt))).toEqual(["19:00", "19:45", "20:30", "21:15"]);
    expect(wallClock(day.slots[3].endsAt)).toBe("22:00");
  });

  it("keeps the wall clock stable across the DST switch", () => {
    // 25 oktober 2026 is de zondag waarop de klok een uur terug gaat; de maandag
    // erna staat de piano nog steeds om 19u op de klok open, niet om 18u of 20u.
    const [day] = generatePianoDays([EVENINGS], [], {
      from: ymd("2026-10-26"),
      to: ymd("2026-10-26"),
      slotMinutes: 60,
    });
    expect(day.slots.map((s) => wallClock(s.startsAt))).toEqual(["19:00", "20:00", "21:00"]);
  });

  it("drops days inside a closure", () => {
    const days = generatePianoDays([EVENINGS], [{ startDate: "2026-10-05", endDate: "2026-10-06" }], {
      from: ymd("2026-10-05"),
      to: ymd("2026-10-11"),
      slotMinutes: 60,
    });
    expect(days.map((d) => d.date)).toEqual(["2026-10-08"]);
  });

  it("honours the validity period of a window", () => {
    const windows = [{ ...EVENINGS, startDate: "2026-10-06", endDate: "2026-10-06" }];
    const days = generatePianoDays(windows, [], {
      from: ymd("2026-10-05"),
      to: ymd("2026-10-11"),
      slotMinutes: 60,
    });
    expect(days.map((d) => d.date)).toEqual(["2026-10-06"]);
  });

  it("does not double up slots when two windows overlap", () => {
    const overlapping: PianoWindowRule = { ...EVENINGS, startMinute: 20 * 60, endMinute: 23 * 60 };
    const [day] = generatePianoDays([EVENINGS, overlapping], [], {
      from: ymd("2026-10-05"),
      to: ymd("2026-10-05"),
      slotMinutes: 60,
    });
    expect(day.slots.map((s) => wallClock(s.startsAt))).toEqual([
      "19:00",
      "20:00",
      "21:00",
      "22:00",
    ]);
  });
});

describe("findPianoSlot", () => {
  const [day] = generatePianoDays([EVENINGS], [], {
    from: ymd("2026-10-05"),
    to: ymd("2026-10-05"),
    slotMinutes: 60,
  });

  it("finds a slot that the generator produced", () => {
    expect(findPianoSlot([EVENINGS], [], day.slots[1].startsAt, 60)).not.toBeNull();
  });

  it("rejects a start time that is not on the grid", () => {
    const offGrid = new Date(day.slots[0].startsAt.getTime() + 30 * 60000);
    expect(findPianoSlot([EVENINGS], [], offGrid, 60)).toBeNull();
  });

  it("rejects a slot on a closed day", () => {
    const closures = [{ startDate: "2026-10-05", endDate: "2026-10-05" }];
    expect(findPianoSlot([EVENINGS], closures, day.slots[0].startsAt, 60)).toBeNull();
  });
});

describe("isPianoSlotBookable", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const config = parsePianoConfig({ horizonDays: 7 });

  it("refuses a slot that already started", () => {
    expect(isPianoSlotBookable(new Date("2026-10-05T11:00:00Z"), now, config)).toBe(false);
  });

  it("accepts a slot inside the horizon and refuses one past it", () => {
    expect(isPianoSlotBookable(new Date("2026-10-12T17:00:00Z"), now, config)).toBe(true);
    expect(isPianoSlotBookable(new Date("2026-10-13T17:00:00Z"), now, config)).toBe(false);
  });
});

describe("pianoWeekRange", () => {
  it("spans Monday 00:00 up to the next Monday, in Brussels time", () => {
    // Donderdag 8 oktober 2026, 19u Brussel.
    const { from, to } = pianoWeekRange(new Date("2026-10-08T17:00:00Z"));
    expect(from.toISOString()).toBe("2026-10-04T22:00:00.000Z"); // ma 5 okt, 00:00 Brussel
    expect(to.toISOString()).toBe("2026-10-11T22:00:00.000Z"); // ma 12 okt, 00:00 Brussel
  });
});

describe("isoWeekKey", () => {
  it("puts a Sunday in the week that started the Monday before", () => {
    expect(isoWeekKey(ymd("2026-10-05"))).toBe(isoWeekKey(ymd("2026-10-11")));
    expect(isoWeekKey(ymd("2026-10-12"))).not.toBe(isoWeekKey(ymd("2026-10-11")));
  });

  it("counts the turn of the year by its Thursday", () => {
    // 1 januari 2027 is een vrijdag, dus hoort ze nog bij week 53 van 2026.
    expect(isoWeekKey(ymd("2027-01-01"))).toBe("2026-W53");
    expect(isoWeekKey(ymd("2027-01-04"))).toBe("2027-W01");
  });
});

describe("parsePianoConfig", () => {
  it("falls back to the defaults on nonsense", () => {
    expect(parsePianoConfig(null)).toEqual({ slotMinutes: 60, maxPerWeek: 1, horizonDays: 28 });
    expect(parsePianoConfig({ slotMinutes: 0, maxPerWeek: -3 })).toEqual({
      slotMinutes: 60,
      maxPerWeek: 1,
      horizonDays: 28,
    });
  });

  it("keeps values that are in range", () => {
    expect(parsePianoConfig({ slotMinutes: 30, maxPerWeek: 2, horizonDays: 60 })).toEqual({
      slotMinutes: 30,
      maxPerWeek: 2,
      horizonDays: 60,
    });
  });
});
