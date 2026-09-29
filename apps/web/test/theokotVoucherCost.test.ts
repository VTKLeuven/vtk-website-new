import { describe, expect, it } from "vitest";

import { DEFAULT_THEOKOT_CONFIG, parseTheokotConfig, sandwichVoucherCost } from "@/lib/theokot";

describe("sandwichVoucherCost", () => {
  const half = DEFAULT_THEOKOT_CONFIG.voucherHalfCents;

  it("rekent een half bonnetje per 60 cent, afgerond op het dichtste halve", () => {
    expect(half).toBe(60);
    expect(sandwichVoucherCost(230, half)).toBe(2);
    expect(sandwichVoucherCost(260, half)).toBe(2);
    expect(sandwichVoucherCost(300, half)).toBe(2.5);
  });

  it("legt de grenzen op de helft", () => {
    expect(sandwichVoucherCost(209, half)).toBe(1.5);
    expect(sandwichVoucherCost(210, half)).toBe(2);
    expect(sandwichVoucherCost(269, half)).toBe(2);
    expect(sandwichVoucherCost(270, half)).toBe(2.5);
  });

  it("vraagt minstens een half voor een broodje met een prijs, en niets voor een gratis", () => {
    expect(sandwichVoucherCost(10, half)).toBe(0.5);
    expect(sandwichVoucherCost(0, half)).toBe(0);
  });

  it("volgt de instelling", () => {
    expect(sandwichVoucherCost(300, 50)).toBe(3);
  });
});

describe("parseTheokotConfig voucherHalfCents", () => {
  it("valt terug op 60 cent zonder of met een ongeldige waarde", () => {
    expect(parseTheokotConfig({}).voucherHalfCents).toBe(60);
    expect(parseTheokotConfig({ voucherHalfCents: 0 }).voucherHalfCents).toBe(60);
    expect(parseTheokotConfig({ voucherHalfCents: 55 }).voucherHalfCents).toBe(55);
  });
});
