import { describe, expect, it } from "vitest";

import { normalizeRNumber, pickupSearchTerms } from "@/lib/theokotPickupQuery";

describe("normalizeRNumber", () => {
  it("herkent een r-nummer zoals het aan de balie getikt wordt", () => {
    expect(normalizeRNumber("r0123456")).toBe("r0123456");
    expect(normalizeRNumber("R0123456")).toBe("r0123456");
    expect(normalizeRNumber(" r 0123456 ")).toBe("r0123456");
    expect(normalizeRNumber("0123456")).toBe("r0123456");
    expect(normalizeRNumber("u0123456")).toBe("u0123456");
  });

  it("laat een naam of een half nummer aan de naamzoeker", () => {
    expect(normalizeRNumber("Jan Peeters")).toBeNull();
    expect(normalizeRNumber("r01234")).toBeNull();
    expect(normalizeRNumber("r01234567")).toBeNull();
    expect(normalizeRNumber("")).toBeNull();
  });
});

describe("pickupSearchTerms", () => {
  it("splitst op witruimte en laat lege woorden weg", () => {
    expect(pickupSearchTerms("  jan   peeters ")).toEqual(["jan", "peeters"]);
  });

  it("neemt hoogstens vijf woorden mee", () => {
    expect(pickupSearchTerms("a b c d e f g")).toHaveLength(5);
  });
});
