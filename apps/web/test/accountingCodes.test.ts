import { describe, expect, it } from "vitest";
import {
  filterAccountingCodeGroups,
  groupAccountingCodes,
  orderAccountingCodes,
  parseMainCode,
  parseSubSuffix,
  subCode,
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
    expect(parseSubSuffix("700100 10002", "700100")).toBe("10002");
    // Zo stond ze vroeger, en zo staat ze nog op een oud uittreksel.
    expect(parseSubSuffix("70010010002", "700100")).toBe("10002");
    expect(parseSubSuffix("700 100 10002", "700100")).toBe("10002");
    // De volledige code van een andere hoofdrekening is geen subcode van deze.
    expect(parseSubSuffix("700110 11001", "700100")).toBeNull();
    expect(parseSubSuffix("1002", "700100")).toBeNull();
  });

  it("writes a sub code as main account, space, analytic code", () => {
    expect(subCode("700120", "12002")).toBe("700120 12002");
  });

  it("shows only the own digits of a sub code in the edit field", () => {
    expect(subSuffix("700100 10002")).toBe("10002");
  });
});

describe("orderAccountingCodes", () => {
  it("lists each main account followed by its sub codes, by code when nobody ordered them", () => {
    const ordered = orderAccountingCodes([
      { id: "c", code: "700100 10002", name: "TD's", parentId: "a", sortOrder: 0 },
      { id: "b", code: "730000", name: "Lidgelden", parentId: null, sortOrder: 0 },
      { id: "d", code: "700100 10001", name: "Cantussen", parentId: "a", sortOrder: 0 },
      { id: "a", code: "700100", name: "Activiteiten opbrengsten", parentId: null, sortOrder: 0 },
    ]);
    expect(ordered.map((row) => [row.code, row.depth])).toEqual([
      ["700100", 0],
      ["700100 10001", 1],
      ["700100 10002", 1],
      ["730000", 0],
    ]);
  });

  it("follows the order the treasurer dragged, for main accounts and sub codes alike", () => {
    const ordered = orderAccountingCodes([
      { id: "a", code: "700100", name: "Activiteiten opbrengsten", parentId: null, sortOrder: 1 },
      { id: "c", code: "700100 10002", name: "TD's", parentId: "a", sortOrder: 0 },
      { id: "d", code: "700100 10001", name: "Cantussen", parentId: "a", sortOrder: 1 },
      { id: "b", code: "730000", name: "Lidgelden", parentId: null, sortOrder: 0 },
    ]);
    expect(ordered.map((row) => row.code)).toEqual([
      "730000",
      "700100",
      "700100 10002",
      "700100 10001",
    ]);
  });

  it("keeps a sub code whose main account is missing instead of dropping it", () => {
    const ordered = orderAccountingCodes([
      { id: "x", code: "700100 10001", name: "Cantussen", parentId: "gone", sortOrder: 0 },
    ]);
    expect(ordered).toEqual([
      { id: "x", code: "700100 10001", name: "Cantussen", parentId: "gone", sortOrder: 0, depth: 0 },
    ]);
  });
});

describe("searching accounting codes", () => {
  const groups = groupAccountingCodes([
    { id: "act", code: "700100", name: "Activiteiten opbrengsten", parentId: null, sortOrder: 0 },
    { id: "act-cantus", code: "700100 10001", name: "Cantussen", parentId: "act", sortOrder: 0 },
    { id: "act-td", code: "700100 10002", name: "TD's", parentId: "act", sortOrder: 1 },
    { id: "int", code: "700120", name: "Internationaal opbrengsten", parentId: null, sortOrder: 1 },
    { id: "int-od", code: "700120 12001", name: "Orientation Days", parentId: "int", sortOrder: 0 },
    { id: "int-cantus", code: "700120 12002", name: "Cantussen", parentId: "int", sortOrder: 1 },
    { id: "fin", code: "757000", name: "Financiële opbrengsten", parentId: null, sortOrder: 2 },
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
    expect(shown("internationaal")).toEqual([["700120", ["700120 12001", "700120 12002"]]]);
  });

  it("shows matching sub codes under their own main account", () => {
    expect(shown("cantus")).toEqual([
      ["700100", ["700100 10001"]],
      ["700120", ["700120 12002"]],
    ]);
  });

  it("narrows with every extra word, across main account and sub code", () => {
    expect(shown("internationaal cantus")).toEqual([["700120", ["700120 12002"]]]);
  });

  it("finds a code by its digits, with or without the space, and ignores accents", () => {
    expect(shown("12001")).toEqual([["700120", ["700120 12001"]]]);
    expect(shown("700120 12002")).toEqual([["700120", ["700120 12002"]]]);
    expect(shown("70012012002")).toEqual([["700120", ["700120 12002"]]]);
    expect(shown("financiele")).toEqual([["757000", []]]);
  });

  it("returns everything for an empty search and nothing for a miss", () => {
    expect(shown("  ")).toHaveLength(3);
    expect(shown("zeilkamp")).toEqual([]);
  });
});
