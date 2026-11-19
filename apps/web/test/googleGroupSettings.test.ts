import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { kiesploegAlias, wantedGroupSettings } from "@/lib/google/sync";

/**
 * De toegangsinstellingen die VTK voor elke groep wil (Admin console >
 * Toegangsinstellingen). Een afwijking hier zet ze bij elke sync op honderd
 * groepen tegelijk verkeerd, dus de tabel staat vast.
 */
describe("wantedGroupSettings", () => {
  it("volgt de standaard van VTK", () => {
    expect(wantedGroupSettings({ allowExternalSenders: true })).toEqual({
      whoCanContactOwner: "ANYONE_CAN_CONTACT",
      whoCanViewGroup: "ALL_MEMBERS_CAN_VIEW",
      whoCanPostMessage: "ANYONE_CAN_POST",
      whoCanViewMembership: "ALL_MEMBERS_CAN_VIEW",
      whoCanModerateMembers: "OWNERS_AND_MANAGERS",
      allowExternalMembers: "true",
    });
  });

  it("laat enkel de organisatie posten wanneer mail van buiten uit staat", () => {
    expect(wantedGroupSettings({ allowExternalSenders: false }).whoCanPostMessage).toBe(
      "ALL_IN_DOMAIN_CAN_POST",
    );
  });
});

describe("kiesploegAlias", () => {
  const kiesploeg = { code: "epsilon", aliasTemplate: "{voornaam}.{achternaam}.kiesploeg{code}" };

  it("neemt het adres dat effectief op het account gezet werd", () => {
    expect(
      kiesploegAlias(
        { aliasEmail: "lore.bellen2.kiesploegepsilon@vtk.be", kiesploeg },
        { firstName: "Lore", lastName: "Bellen" },
        "vtk.be",
      ),
    ).toBe("lore.bellen2.kiesploegepsilon@vtk.be");
  });

  it("valt terug op het sjabloon van de ploeg", () => {
    expect(
      kiesploegAlias({ aliasEmail: null, kiesploeg }, { firstName: "Lore", lastName: "Bellen" }, "vtk.be"),
    ).toBe("lore.bellen.kiesploegepsilon@vtk.be");
  });
});
