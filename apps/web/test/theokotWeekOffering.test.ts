import { describe, expect, it } from "vitest";
import { offeringKey, planDayOffering } from "@/lib/theokot";

/**
 * "Aanbod van de week": welk broodje op een andere dag bij welke rij van de
 * voorbeelddag hoort. Elke dag heeft zijn eigen kopie van het aanbod.
 */
const source = [
  { id: "ma-brie", productId: "p-brie", nameNl: "Broodje Brie" },
  { id: "ma-kaas", productId: null, nameNl: "Broodje Kaas" },
  { id: "ma-hesp", productId: "p-hesp", nameNl: "Broodje Hesp" },
];

describe("aanbod van de week", () => {
  it("koppelt via het catalogusproduct, en anders via de naam", () => {
    const target = [
      { id: "di-brie", productId: "p-brie", nameNl: "Brie (hernoemd)", hasLines: false },
      { id: "di-kaas", productId: null, nameNl: "  broodje kaas ", hasLines: false },
    ];
    const plan = planDayOffering(source, target, [
      { sourceId: "ma-brie" },
      { sourceId: "ma-kaas" },
      { sourceId: "ma-hesp" },
    ]);
    expect(plan.update).toEqual([
      { row: 0, targetId: "di-brie" },
      { row: 1, targetId: "di-kaas" },
    ]);
    // Hesp bestond op dinsdag niet: die komt erbij.
    expect(plan.create).toEqual([2]);
    expect(plan.remove).toEqual([]);
  });

  it("zet een nieuwe rij op elke dag erbij", () => {
    const plan = planDayOffering(source, [], [{ sourceId: null }]);
    expect(plan.create).toEqual([0]);
  });

  it("haalt weg wat uit de lijst verdween, behalve wat al besteld is", () => {
    const target = [
      { id: "di-brie", productId: "p-brie", nameNl: "Broodje Brie", hasLines: false },
      { id: "di-hesp", productId: "p-hesp", nameNl: "Broodje Hesp", hasLines: true },
      { id: "di-extra", productId: null, nameNl: "Pasta", hasLines: false },
    ];
    const plan = planDayOffering(source, target, [{ sourceId: "ma-brie" }]);
    expect(plan.remove).toEqual(["di-extra"]);
  });

  it("koppelt een broodje van de andere dag maar aan één rij", () => {
    const target = [{ id: "di-brie", productId: "p-brie", nameNl: "Broodje Brie", hasLines: false }];
    const plan = planDayOffering(source, target, [{ sourceId: "ma-brie" }, { sourceId: "ma-brie" }]);
    expect(plan.update).toEqual([{ row: 0, targetId: "di-brie" }]);
    expect(plan.create).toEqual([1]);
  });

  it("negeert hoofdletters en spaties in de naam", () => {
    expect(offeringKey({ productId: null, nameNl: " Pasta Pesto " })).toBe(
      offeringKey({ productId: null, nameNl: "pasta pesto" }),
    );
  });
});
