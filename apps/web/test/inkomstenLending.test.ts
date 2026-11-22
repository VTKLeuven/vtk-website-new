import { describe, expect, it } from "vitest";
import { checkLendingDays, lendingDayCount, MAX_LENDING_DAYS, overlappingLending } from "@/lib/inkomsten/lending";

describe("dagen van een uitlening", () => {
  it("neemt zonder laatste dag enkel de eerste", () => {
    expect(checkLendingDays("2026-09-16", "")).toEqual({ ok: true, from: "2026-09-16", to: "2026-09-16" });
    expect(checkLendingDays(" 2026-09-16 ", "2026-09-23")).toEqual({ ok: true, from: "2026-09-16", to: "2026-09-23" });
  });

  it("weigert een dag die niet bestaat, een omgekeerde reeks en meer dan een jaar", () => {
    expect(checkLendingDays("2026-02-30", "")).toEqual({ ok: false, error: "BAD_DATE" });
    expect(checkLendingDays("", "2026-09-16")).toEqual({ ok: false, error: "BAD_DATE" });
    expect(checkLendingDays("2026-09-23", "2026-09-16")).toEqual({ ok: false, error: "LENDING_ORDER" });
    expect(checkLendingDays("2026-01-01", "2026-12-31").ok).toBe(true);
    // 2028 is een schrikkeljaar: 1 januari tot en met 1 januari is 367 dagen.
    expect(checkLendingDays("2028-01-01", "2029-01-01")).toEqual({ ok: false, error: "LENDING_TOO_LONG" });
  });

  it("telt beide grenzen mee, ook over een overgang van uur", () => {
    expect(lendingDayCount({ from: "2026-09-16", to: "2026-09-23" })).toBe(8);
    expect(lendingDayCount({ from: "2026-10-24", to: "2026-10-26" })).toBe(3);
    expect(lendingDayCount({ from: "2028-01-01", to: "2028-12-31" })).toBe(MAX_LENDING_DAYS);
  });

  it("vindt een andere uitlening die een dag deelt, maar niet zichzelf", () => {
    const others = [
      { id: "a", from: "2026-09-16", to: "2026-09-23" },
      { id: "b", from: "2026-10-01", to: "2026-10-01" },
    ];
    expect(overlappingLending(others, { from: "2026-09-23", to: "2026-09-25" }, null)?.id).toBe("a");
    expect(overlappingLending(others, { from: "2026-09-24", to: "2026-09-30" }, null)).toBeNull();
    expect(overlappingLending(others, { from: "2026-09-10", to: "2026-10-05" }, null)?.id).toBe("a");
    // Een uitlening aanpassen botst niet met zichzelf.
    expect(overlappingLending(others, { from: "2026-09-15", to: "2026-09-20" }, "a")).toBeNull();
  });
});
