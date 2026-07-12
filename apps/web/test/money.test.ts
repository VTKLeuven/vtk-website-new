import { describe, expect, it } from "vitest";
import { formatMoney, parseEuroAmount } from "@/lib/ticketing/money";

describe("ticket money", () => {
  it("parses euro input to integer cents", () => {
    expect(parseEuroAmount("12,50")).toBe(1250);
    expect(parseEuroAmount("0")).toBe(0);
    expect(() => parseEuroAmount("12.345")).toThrow("INVALID_AMOUNT");
    expect(() => parseEuroAmount("-1")).toThrow("INVALID_AMOUNT");
  });

  it("formats integer cents", () => {
    expect(formatMoney(1250, "EUR", "nl-BE")).toContain("12,50");
  });
});
