import { describe, expect, it } from "vitest";

import { AUDIT_ENTITIES, AUDIT_GROUPS, describeChanges } from "@/lib/audit";

/**
 * `describeChanges` schrijft het "wat is er veranderd"-zinnetje in het
 * adminlogboek. Fout gaat het op twee manieren, en allebei maken ze het logboek
 * onbetrouwbaar: velden melden die niemand aanraakte, of een echte wijziging
 * verzwijgen.
 */
describe("describeChanges", () => {
  const labels = { titleNl: "titel", location: "locatie", start: "startmoment" };

  it("noemt enkel de velden die effectief wijzigden", () => {
    const before = { titleNl: "Galabal", location: "Aula", start: new Date("2026-03-01T19:00:00Z") };
    const after = { titleNl: "Galabal", location: "Alma 3", start: new Date("2026-03-01T19:00:00Z") };

    expect(describeChanges(before, after, labels)).toBe("locatie gewijzigd");
  });

  it("somt meerdere wijzigingen leesbaar op", () => {
    const before = { titleNl: "Galabal", location: "Aula", start: new Date("2026-03-01T19:00:00Z") };
    const after = { titleNl: "Gala", location: "Alma 3", start: new Date("2026-03-02T19:00:00Z") };

    expect(describeChanges(before, after, labels)).toBe(
      "titel, locatie en startmoment gewijzigd",
    );
  });

  it("geeft null terug wanneer er niets veranderde", () => {
    const row = { titleNl: "Galabal", location: "Aula", start: new Date("2026-03-01T19:00:00Z") };

    expect(describeChanges(row, { ...row }, labels)).toBeNull();
  });

  it("negeert velden die niet meegeschreven werden", () => {
    // Zo leest Prisma `undefined` ook: "niet aanraken". Een PATCH met enkel een
    // nieuwe locatie mag geen "titel gewijzigd" opleveren.
    const before = { titleNl: "Galabal", location: "Aula" };

    expect(describeChanges(before, { location: "Alma 3" }, labels)).toBe("locatie gewijzigd");
  });

  it("ziet een lege string en null als dezelfde lege waarde", () => {
    // Formulieren sturen "" waar de database null bewaart; dat is geen wijziging.
    expect(describeChanges({ location: null }, { location: "" }, labels)).toBeNull();
    expect(describeChanges({ location: "" }, { location: "Alma 3" }, labels)).toBe(
      "locatie gewijzigd",
    );
  });

  it("vergelijkt datums op hun waarde, niet op objectidentiteit", () => {
    const before = { start: new Date("2026-03-01T19:00:00Z") };
    const after = { start: new Date("2026-03-01T19:00:00Z") };

    expect(describeChanges(before, after, labels)).toBeNull();
  });

  it("vergelijkt lijsten op hun inhoud", () => {
    expect(describeChanges({ tags: ["a", "b"] }, { tags: ["a", "b"] }, { tags: "richtingen" })).toBeNull();
    expect(describeChanges({ tags: ["a"] }, { tags: ["a", "b"] }, { tags: "richtingen" })).toBe(
      "richtingen gewijzigd",
    );
  });
});

/**
 * Het filter op de logboekpagina groepeert de soorten onderwerp per admin-tab.
 * Een soort met een groep die niet bestaat, valt daardoor uit elk filter en is
 * dus enkel via de zoekbalk te vinden.
 */
describe("de registry van onderwerpen", () => {
  it("verwijst enkel naar bestaande groepen", () => {
    const groups = new Set(Object.keys(AUDIT_GROUPS));
    const orphans = Object.entries(AUDIT_ENTITIES)
      .filter(([, entity]) => !groups.has(entity.group))
      .map(([key]) => key);

    expect(orphans).toEqual([]);
  });
});
