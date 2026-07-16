import { describe, expect, it } from "vitest";
import { localDateTimeToUtc } from "@/lib/ticketing/time";

describe("Brussels local time conversion", () => {
  it("uses the winter UTC offset", () => {
    expect(localDateTimeToUtc("2027-01-15T12:00").toISOString()).toBe("2027-01-15T11:00:00.000Z");
  });

  it("uses the summer UTC offset", () => {
    expect(localDateTimeToUtc("2027-07-15T12:00").toISOString()).toBe("2027-07-15T10:00:00.000Z");
  });

  it("rejects a local time skipped by daylight saving time", () => {
    expect(() => localDateTimeToUtc("2027-03-28T02:30")).toThrow("NON_EXISTENT");
  });
});
