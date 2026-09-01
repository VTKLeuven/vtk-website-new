import { describe, expect, it } from "vitest";
import { getDictionary } from "@vtk/i18n";
import { ADMIN_NAV_KEYS, getAdminNav, NAV, type NavEntry, type NavLeaf } from "@/lib/admin-nav";

const leaves = (entry: NavEntry): NavLeaf[] => ("group" in entry ? entry.items : [entry]);
const allLeaves = NAV.flatMap(leaves);

describe("admin nav structure", () => {
  it("has a unique key per tab", () => {
    const keys = allLeaves.map((leaf) => leaf.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("exposes every tab key for the pin action to validate against", () => {
    expect(ADMIN_NAV_KEYS.size).toBe(allLeaves.length);
    for (const leaf of allLeaves) expect(ADMIN_NAV_KEYS.has(leaf.key)).toBe(true);
  });

  it("has no group that is really a single item in either nav mode", () => {
    for (const nav of [getAdminNav({ isItOrG5: false }), getAdminNav({ isItOrG5: true })]) {
      for (const entry of nav) {
        if ("group" in entry) expect(entry.items.length).toBeGreaterThan(1);
      }
    }
  });

  // De zijbalk sorteert niet meer; de volgorde hieronder is wat je op het scherm
  // ziet. Zonder label valt een tab stil terug op `undefined`, en dat zie je pas
  // in de browser.
  it.each(["nl", "en"] as const)("has a %s label for every key, group included", (locale) => {
    const admin = getDictionary(locale).admin as Record<string, string | undefined>;
    for (const nav of [getAdminNav({ isItOrG5: false }), getAdminNav({ isItOrG5: true })]) {
      for (const entry of nav) {
        if ("group" in entry) expect(admin[entry.group], `group ${entry.group}`).toBeTruthy();
        for (const leaf of leaves(entry)) expect(admin[leaf.key], `tab ${leaf.key}`).toBeTruthy();
      }
    }
  });

  it("keeps the dashboard first and IT last", () => {
    const first = NAV[0];
    const last = NAV[NAV.length - 1];
    expect("group" in first && first.group).toBe("dashboard");
    expect("group" in last && last.group).toBe("it");
  });

  it("places piano in the website group", () => {
    const websiteGroup = NAV.find((e): e is Extract<NavEntry, { group: string }> => "group" in e && e.group === "website");
    expect(websiteGroup?.items.map((i) => i.key)).toContain("piano");
  });

  it("leaves post-specific daily modules loose for normal posts, but groups fakscanner and theokot under overig for IT and G5", () => {
    const normalNav = getAdminNav({ isItOrG5: false });
    const normalLoose = normalNav.filter((entry): entry is NavLeaf => !("group" in entry)).map((leaf) => leaf.key);
    expect(normalLoose).toContain("fakscanner");
    expect(normalLoose).toContain("grocomeet");

    // Theokot is er twee (broodjes en verhuur) en staat daarom als eigen groep,
    // ook voor een gewone post.
    const theokotGroup = normalNav.find(
      (e): e is Extract<NavEntry, { group: string }> => "group" in e && e.group === "theokot",
    );
    expect(theokotGroup?.items.map((i) => i.key)).toEqual(["theokotBroodjes", "theokotVerhuur"]);

    const itG5Nav = getAdminNav({ isItOrG5: true });
    const itG5Loose = itG5Nav.filter((entry): entry is NavLeaf => !("group" in entry)).map((leaf) => leaf.key);
    expect(itG5Loose).not.toContain("fakscanner");
    expect(itG5Loose).not.toContain("theokotBroodjes");
    expect(itG5Loose).toContain("grocomeet");

    const overigGroup = itG5Nav.find((e): e is Extract<NavEntry, { group: string }> => "group" in e && e.group === "overig");
    expect(overigGroup?.items.map((i) => i.key)).toEqual([
      "fakscanner",
      "theokotBroodjes",
      "theokotVerhuur",
    ]);
  });

  it("routes every internal tab to a path below /admin", () => {
    for (const leaf of allLeaves) {
      if (leaf.href.startsWith("http")) continue;
      expect(leaf.href === "" || leaf.href.startsWith("/")).toBe(true);
    }
  });
});
