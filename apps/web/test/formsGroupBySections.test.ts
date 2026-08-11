import { describe, expect, it } from "vitest";
import { groupBySections } from "@/lib/forms/groupBySections";

describe("groupBySections", () => {
  it("houdt veldvolgorde en lege secties intact", () => {
    const grouped = groupBySections(
      [
        { item: "boven", sectionId: null },
        { item: "tweede", sectionId: "s2" },
        { item: "eerste-a", sectionId: "s1" },
        { item: "eerste-b", sectionId: "s1" },
      ],
      ["s1", "s2", "leeg"]
    );

    expect(grouped.unsectioned).toEqual(["boven"]);
    expect(grouped.bySection.get("s1")).toEqual(["eerste-a", "eerste-b"]);
    expect(grouped.bySection.get("s2")).toEqual(["tweede"]);
    expect(grouped.bySection.get("leeg")).toEqual([]);
  });

  it("laat een veld met een verdwenen sectie niet stil verdwijnen", () => {
    const grouped = groupBySections([{ item: "zichtbaar", sectionId: "verwijderd" }], ["bestaand"]);

    expect(grouped.unsectioned).toEqual(["zichtbaar"]);
  });
});
