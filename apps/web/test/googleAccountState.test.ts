import { describe, expect, it } from "vitest";
import { desiredAccountState, transitionAllowed } from "@/lib/google/accountState";

/**
 * De regel die bepaalt wanneer iemand mag mailen. De tegenhanger daarvan, "een
 * afgeleide staat mag automatisch upgraden maar nooit automatisch degraderen",
 * staat in `transitionAllowed` en is hieronder apart vastgezet.
 */
const kiesploeg = (over: Partial<{ sendFromAlias: boolean; tookOffice: boolean; keepAccount: boolean }> = {}) => ({
  sendFromAlias: false,
  tookOffice: false,
  keepAccount: false,
  ...over,
});

describe("desiredAccountState", () => {
  it("geeft een volwaardig account aan wie dit werkingsjaar een post heeft", () => {
    expect(
      desiredAccountState({ hasCurrentPost: true, kiesploeg: null, suspensionAllowed: false }),
    ).toBe("FULL");
  });

  it("laat een kiesploeglid enkel ontvangen", () => {
    expect(
      desiredAccountState({ hasCurrentPost: false, kiesploeg: kiesploeg(), suspensionAllowed: false }),
    ).toBe("RESTRICTED");
  });

  it("laat de aangeduide kiesploegleden mailen vanaf hun kiesploegadres", () => {
    expect(
      desiredAccountState({
        hasCurrentPost: false,
        kiesploeg: kiesploeg({ sendFromAlias: true }),
        suspensionAllowed: false,
      }),
    ).toBe("ALIAS_SENDER");
  });

  it("laat een post winnen van de kiesploeg", () => {
    // Op 15 juli treedt de ploeg aan: vanaf dan telt de post.
    expect(
      desiredAccountState({
        hasCurrentPost: true,
        kiesploeg: kiesploeg({ tookOffice: true }),
        suspensionAllowed: true,
      }),
    ).toBe("FULL");
  });

  it("schorst wie verkozen werd maar geen post kreeg", () => {
    expect(
      desiredAccountState({
        hasCurrentPost: false,
        kiesploeg: kiesploeg({ tookOffice: true }),
        suspensionAllowed: true,
      }),
    ).toBe("SUSPENDED");
  });

  it("schorst niemand zolang de postverdeling niet ingevoerd is", () => {
    // Anders schorst de eerste ronde na 15 juli de hele ploeg wanneer niemand
    // de posten op tijd invulde.
    expect(
      desiredAccountState({
        hasCurrentPost: false,
        kiesploeg: kiesploeg({ tookOffice: true }),
        suspensionAllowed: false,
      }),
    ).toBeNull();
  });

  it("schorst niet opnieuw wie een beheerder bewust liet staan", () => {
    expect(
      desiredAccountState({
        hasCurrentPost: false,
        kiesploeg: kiesploeg({ tookOffice: true, keepAccount: true }),
        suspensionAllowed: true,
      }),
    ).toBeNull();
  });

  it("heeft geen mening over wie nergens meer in zit", () => {
    // Dit is het vertrekkende praesidium na 15 juli. `null` betekent "niet
    // aanraken"; zou hier RESTRICTED staan, dan verloor dat hele praesidium in
    // één reconcile zijn mailbox.
    expect(
      desiredAccountState({ hasCurrentPost: false, kiesploeg: null, suspensionAllowed: true }),
    ).toBeNull();
  });
});

describe("transitionAllowed", () => {
  it("degradeert een volwaardig account nooit vanzelf", () => {
    expect(transitionAllowed("FULL", "RESTRICTED")).toBe(false);
    expect(transitionAllowed("FULL", "ALIAS_SENDER")).toBe(false);
    expect(transitionAllowed("FULL", "SUSPENDED")).toBe(false);
  });

  it("schorst enkel een account dat de kiesploeg maakte", () => {
    expect(transitionAllowed("RESTRICTED", "SUSPENDED")).toBe(true);
    expect(transitionAllowed("ALIAS_SENDER", "SUSPENDED")).toBe(true);
    // Een account waarvan we de staat nooit zetten, is van iemand anders.
    expect(transitionAllowed(null, "SUSPENDED")).toBe(false);
  });

  it("maakt een geschorst account volwaardig zodra het lid alsnog een post krijgt", () => {
    expect(transitionAllowed("SUSPENDED", "FULL")).toBe(true);
  });

  it("wisselt vrij tussen enkel ontvangen en mailen vanaf het kiesploegadres", () => {
    expect(transitionAllowed("RESTRICTED", "ALIAS_SENDER")).toBe(true);
    expect(transitionAllowed("ALIAS_SENDER", "RESTRICTED")).toBe(true);
  });
});
