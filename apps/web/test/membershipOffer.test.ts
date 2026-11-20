import { describe, expect, it } from "vitest";

import { DEFAULT_MEMBERSHIP_CONFIG, parseMembershipConfig } from "@/lib/membership/config";
import { isHonoraryMember } from "@/lib/membership/honorary";
import { honoraryOffer, membershipOffer } from "@/lib/membership/offer";
import {
  compareSortValues,
  DEFAULT_HONORARY_SORT,
  DEFAULT_MEMBER_SORT,
  memberSortParams,
  nextMemberSort,
  parseMemberSort,
} from "@/lib/membership/sort";

describe("ereleden en het lidmaatschap", () => {
  it("een erelid krijgt geen aanbod om lid te worden: hij is het al", () => {
    const config = { ...DEFAULT_MEMBERSHIP_CONFIG, externalOpen: true };
    expect(membershipOffer({ firwStudent: false, honoraryMember: true }, null, config)).toEqual({
      kind: "none",
      reason: "already",
    });
    expect(membershipOffer({ firwStudent: false, honoraryMember: false }, null, config).kind).toBe("external");
  });
});

describe("betalende ereleden", () => {
  const config = { ...DEFAULT_MEMBERSHIP_CONFIG };
  const nonStudent = { isStudent: false, honoraryMember: false };

  it("biedt het erelidmaatschap aan wie geen student is, aan de ingestelde prijs", () => {
    expect(honoraryOffer(nonStudent, null, config)).toEqual({ kind: "honorary", priceCents: 7500 });
    expect(honoraryOffer(nonStudent, null, { ...config, honoraryPriceCents: 9000 })?.priceCents).toBe(9000);
  });

  it("biedt niets aan een student, een blijvend erelid of wanneer de weg dicht staat", () => {
    expect(honoraryOffer({ isStudent: true, honoraryMember: false }, null, config)).toBeNull();
    expect(honoraryOffer({ isStudent: false, honoraryMember: true }, null, config)).toBeNull();
    expect(honoraryOffer(nonStudent, null, { ...config, honoraryOpen: false })).toBeNull();
  });

  it("zet een onbetaald lidmaatschap om, maar niet een geldig of een openstaand erelidmaatschap", () => {
    expect(honoraryOffer(nonStudent, { kind: "EXTERNAL", activatedAt: null }, config)).not.toBeNull();
    expect(honoraryOffer(nonStudent, { kind: "EXTERNAL", activatedAt: new Date() }, config)).toBeNull();
    expect(honoraryOffer(nonStudent, { kind: "HONORARY", activatedAt: null }, config)).toBeNull();
  });

  it("valt terug op 75 euro bij een oude of kapotte instelling, en nooit op gratis", () => {
    expect(parseMembershipConfig({ externalPriceCents: 2500 }).honoraryPriceCents).toBe(7500);
    expect(parseMembershipConfig({ honoraryPriceCents: 0 }).honoraryPriceCents).toBe(7500);
    expect(parseMembershipConfig({ honoraryPriceCents: 8000, honoraryOpen: false })).toMatchObject({
      honoraryPriceCents: 8000,
      honoraryOpen: false,
    });
  });

  it("telt de vlag en een betaalde erelidrij allebei als erelid", () => {
    expect(isHonoraryMember({ honoraryMember: true })).toBe(true);
    expect(isHonoraryMember({ honoraryMember: false, vtkMemberships: [{ id: "m1" }] })).toBe(true);
    expect(isHonoraryMember({ honoraryMember: false, vtkMemberships: [] })).toBe(false);
  });
});

describe("sorteren in de ledenlijst", () => {
  it("leest de sortering uit de URL, met de standaard van de lijst als terugval", () => {
    expect(parseMemberSort(null, null)).toEqual(DEFAULT_MEMBER_SORT);
    expect(parseMemberSort("onzin", "op")).toEqual(DEFAULT_MEMBER_SORT);
    expect(parseMemberSort(null, null, DEFAULT_HONORARY_SORT)).toEqual(DEFAULT_HONORARY_SORT);
    expect(parseMemberSort("naam", "af")).toEqual({ key: "naam", dir: "desc" });
    expect(parseMemberSort("bedrag", null)).toEqual({ key: "bedrag", dir: "desc" });
  });

  it("keert een actieve kolom om en begint een nieuwe in haar eigen richting", () => {
    expect(nextMemberSort({ key: "naam", dir: "asc" }, "naam")).toEqual({ key: "naam", dir: "desc" });
    expect(nextMemberSort({ key: "naam", dir: "asc" }, "datum")).toEqual({ key: "datum", dir: "desc" });
  });

  it("laat de standaard uit de URL, zodat een klik erop niet terugvalt op een andere standaard", () => {
    expect(memberSortParams(DEFAULT_MEMBER_SORT)).toEqual({});
    expect(memberSortParams({ key: "datum", dir: "desc" }, DEFAULT_HONORARY_SORT)).toEqual({
      sorteer: "datum",
      richting: "af",
    });
    const params = memberSortParams({ key: "rnummer", dir: "asc" });
    expect(parseMemberSort(params.sorteer, params.richting)).toEqual({ key: "rnummer", dir: "asc" });
  });

  it("zet lege waarden achteraan, in beide richtingen", () => {
    const values = ["r0200", null, "r0100"];
    expect([...values].sort((a, b) => compareSortValues(a, b, "asc"))).toEqual(["r0100", "r0200", null]);
    expect([...values].sort((a, b) => compareSortValues(a, b, "desc"))).toEqual(["r0200", "r0100", null]);
  });
});
