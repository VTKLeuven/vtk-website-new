import { describe, expect, it } from "vitest";
import { isValidGraduationYear, latestGraduationYear } from "@/lib/profile";

describe("isValidGraduationYear", () => {
  const september2026 = new Date("2026-09-22T10:00:00Z");
  const latest = latestGraduationYear(september2026);

  it("laat volgend jaar toe, maar niet het jaar waarin een masterstudent verwacht af te studeren", () => {
    expect(latest).toBe(2027);
    expect(isValidGraduationYear("2027", latest)).toBe(true);
    // De waarde die een lid op /studie-bevestigen vastzette.
    expect(isValidGraduationYear("2028", latest)).toBe(false);
  });

  it("aanvaardt een leeg veld en weigert wat geen jaar is", () => {
    expect(isValidGraduationYear("", latest)).toBe(true);
    expect(isValidGraduationYear("  ", latest)).toBe(true);
    expect(isValidGraduationYear("1920", latest)).toBe(true);
    expect(isValidGraduationYear("1919", latest)).toBe(false);
    expect(isValidGraduationYear("19", latest)).toBe(false);
    expect(isValidGraduationYear("20x1", latest)).toBe(false);
  });
});
