import { describe, expect, it } from "vitest";
import type { AdminNavNode } from "@vtk/ui";
import { matchAdminNav } from "@vtk/ui/src/admin-nav-match";

const item = (key: string, label: string, path: string) => ({ key, label, href: `/nl/admin${path}` });

const nodes: AdminNavNode[] = [
  { type: "group", key: "dashboard", label: "Dashboard", items: [item("dashboardOverview", "Overzicht", "")] },
  { type: "item", item: item("ledenbeheer", "Ledenbeheer", "/leden") },
  {
    type: "group",
    key: "theokot",
    label: "Theokot",
    items: [item("theokotBroodjes", "Broodjes", "/theokot"), item("theokotVerhuur", "Verhuur", "/theokot/verhuur")],
  },
  {
    type: "group",
    key: "it",
    label: "IT",
    items: [item("flowPreview", "Mails & schermen", "/it/flows"), item("auditLog", "Auditlog", "/it/audit")],
  },
  { type: "item", item: { key: "logistics", label: "Uitleendienst", href: "https://logistiek.vtk.be/beheer" } },
];

const keys = (query: string) => matchAdminNav(nodes, query).map((match) => match.item.key);

describe("admin nav search", () => {
  it("lists every tab in sidebar order without a query", () => {
    expect(keys("")).toEqual([
      "dashboardOverview",
      "ledenbeheer",
      "theokotBroodjes",
      "theokotVerhuur",
      "flowPreview",
      "auditLog",
      "logistics",
    ]);
  });

  it("finds a tab by the start of its label, ignoring case", () => {
    expect(keys("BROOD")).toEqual(["theokotBroodjes"]);
  });

  it("puts a label match before a group match", () => {
    // "Verhuur" staat in het label; "Broodjes" enkel via de groep Theokot.
    expect(keys("theokot verh")).toEqual(["theokotVerhuur"]);
    expect(keys("theokot")).toEqual(["theokotBroodjes", "theokotVerhuur"]);
  });

  it("matches the start of a later word in the label", () => {
    expect(keys("scherm")).toEqual(["flowPreview"]);
  });

  it("finds a tab by its path, but not by the part every tab shares", () => {
    expect(keys("flows")).toEqual(["flowPreview"]);
    expect(keys("admin")).toEqual([]);
  });

  it("ignores accents", () => {
    expect(keys("overzícht")).toEqual(["dashboardOverview"]);
  });

  it("returns the group a tab belongs to", () => {
    expect(matchAdminNav(nodes, "audit").map((match) => match.group)).toEqual(["IT"]);
    expect(matchAdminNav(nodes, "leden").map((match) => match.group)).toEqual([null]);
  });
});
