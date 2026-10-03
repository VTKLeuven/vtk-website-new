import { describe, expect, it } from "vitest";
import {
  filterAccountingCodeGroups,
  groupAccountingCodes,
  orderAccountingCodes,
  parseMainCode,
  parseSubSuffix,
  subSuffix,
} from "@/lib/accounting/codes";

describe("accounting code input", () => {
  it("accepts a main account the way the chart of accounts writes it", () => {
    expect(parseMainCode("700 100")).toBe("700100");
    expect(parseMainCode("700100")).toBe("700100");
    expect(parseMainCode("70010")).toBeNull();
    expect(parseMainCode("70010010002")).toBeNull();
    expect(parseMainCode("7001OO")).toBeNull();
  });

  it("takes five digits for a sub code, or the full code when someone pastes it", () => {
    expect(parseSubSuffix("10002", "700100")).toBe("10002");
    expect(parseSubSuffix("70010010002", "700100")).toBe("10002");
    expect(parseSubSuffix("700 100 10002", "700100")).toBe("10002");
    // De volledige code van een andere hoofdrekening is geen subcode van deze.
    expect(parseSubSuffix("70011011001", "700100")).toBeNull();
    expect(parseSubSuffix("1002", "700100")).toBeNull();
  });

  it("shows only the own digits of a sub code in the edit field", () => {
    expect(subSuffix("70010010002", "700100")).toBe("10002");
  });
});

describe("orderAccountingCodes", () => {
  it("lists each main account followed by its sub codes, both by code", () => {
    const ordered = orderAccountingCodes([
      { id: "c", code: "70010010002", name: "TD's", parentId: "a" },
      { id: "b", code: "730000", name: "Lidgelden", parentId: null },
      { id: "d", code: "70010010001", name: "Cantussen", parentId: "a" },
      { id: "a", code: "700100", name: "Activiteiten opbrengsten", parentId: null },
    ]);
    expect(ordered.map((row) => [row.code, row.depth])).toEqual([
      ["700100", 0],
      ["70010010001", 1],
      ["70010010002", 1],
      ["730000", 0],
    ]);
  });

  it("keeps a sub code whose main account is missing instead of dropping it", () => {
    const ordered = orderAccountingCodes([{ id: "x", code: "70010010001", name: "Cantussen", parentId: "gone" }]);
    expect(ordered).toEqual([{ id: "x", code: "70010010001", name: "Cantussen", parentId: "gone", depth: 0 }]);
  });
});

describe("searching accounting codes", () => {
  const groups = groupAccountingCodes([
    { id: "act", code: "700100", name: "Activiteiten opbrengsten", parentId: null },
    { id: "act-cantus", code: "70010010001", name: "Cantussen", parentId: "act" },
    { id: "act-td", code: "70010010002", name: "TD's", parentId: "act" },
    { id: "int", code: "700120", name: "Internationaal opbrengsten", parentId: null },
    { id: "int-od", code: "70012012001", name: "Orientation Days", parentId: "int" },
    { id: "int-cantus", code: "70012012002", name: "Cantussen", parentId: "int" },
    { id: "fin", code: "757000", name: "Financiële opbrengsten", parentId: null },
  ]);
  const shown = (query: string) =>
    filterAccountingCodeGroups(groups, query).map((group) => [
      group.main.code,
      group.children.map((child) => child.code),
    ]);

  it("groups each main account with its sub codes", () => {
    expect(groups.map((group) => [group.main.code, group.children.length])).toEqual([
      ["700100", 2],
      ["700120", 2],
      ["757000", 0],
    ]);
  });

  it("shows a whole category when its main account matches", () => {
    expect(shown("internationaal")).toEqual([["700120", ["70012012001", "70012012002"]]]);
  });

  it("shows matching sub codes under their own main account", () => {
    expect(shown("cantus")).toEqual([
      ["700100", ["70010010001"]],
      ["700120", ["70012012002"]],
    ]);
  });

  it("narrows with every extra word, across main account and sub code", () => {
    expect(shown("internationaal cantus")).toEqual([["700120", ["70012012002"]]]);
  });

  it("finds a code by its digits and ignores accents", () => {
    expect(shown("12001")).toEqual([["700120", ["70012012001"]]]);
    expect(shown("financiele")).toEqual([["757000", []]]);
  });

  it("returns everything for an empty search and nothing for a miss", () => {
    expect(shown("  ")).toHaveLength(3);
    expect(shown("zeilkamp")).toEqual([]);
  });
});
