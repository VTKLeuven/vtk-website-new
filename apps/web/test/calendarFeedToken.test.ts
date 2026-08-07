import { describe, expect, it } from "vitest";
import {
  createCalendarFeedToken,
  hashCalendarFeedToken,
  isCalendarFeedToken,
  shouldTouchLastUsed,
} from "@/lib/calendar/feedToken";

describe("kalender-feedtokens", () => {
  it("maakt unieke 256-bit tokens met een herkenbaar voorvoegsel", () => {
    const first = createCalendarFeedToken();
    const second = createCalendarFeedToken();

    expect(first).toMatch(/^vtk_cal_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashCalendarFeedToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCalendarFeedToken(first)).toBe(hashCalendarFeedToken(first));
    expect(hashCalendarFeedToken(second)).not.toBe(hashCalendarFeedToken(first));
  });

  it("herkent enkel het exacte formaat, zodat een gok geen query kost", () => {
    expect(isCalendarFeedToken(createCalendarFeedToken())).toBe(true);
    expect(isCalendarFeedToken("vtk_cal_kort")).toBe(false);
    expect(isCalendarFeedToken("vtk_door_" + "a".repeat(43))).toBe(false);
    expect(isCalendarFeedToken("")).toBe(false);
    // Geen padding-tekens: base64url gebruikt ze niet, en '=' hoort niet in een pad.
    expect(isCalendarFeedToken(`vtk_cal_${"a".repeat(42)}=`)).toBe(false);
  });

  it("schrijft lastUsedAt hoogstens één keer per uur", () => {
    const now = new Date("2026-08-06T12:00:00.000Z");
    expect(shouldTouchLastUsed(null, now)).toBe(true);
    expect(shouldTouchLastUsed(new Date("2026-08-06T11:59:00.000Z"), now)).toBe(false);
    expect(shouldTouchLastUsed(new Date("2026-08-06T11:00:00.000Z"), now)).toBe(true);
    expect(shouldTouchLastUsed(new Date("2026-08-06T10:00:00.000Z"), now)).toBe(true);
  });
});
