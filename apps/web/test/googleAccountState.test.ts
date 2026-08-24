import { describe, expect, it } from "vitest";
import { desiredAccountState } from "@/lib/google/accountState";

/**
 * De regel die bepaalt wanneer iemand mag mailen. De tegenhanger daarvan, "een
 * afgeleide staat mag automatisch upgraden maar nooit automatisch degraderen",
 * zit in `applyAccountState` en niet hier; deze functie zegt enkel wat de
 * gewenste staat is.
 */
describe("desiredAccountState", () => {
  it("geeft een volwaardig account aan wie dit werkingsjaar een post heeft", () => {
    expect(desiredAccountState({ hasCurrentPost: true, kiesploeg: null })).toBe("FULL");
  });

  it("beperkt een kiesploeglid zonder post", () => {
    expect(
      desiredAccountState({ hasCurrentPost: false, kiesploeg: { mailboxActive: false } }),
    ).toBe("RESTRICTED");
  });

  it("laat de override winnen voor wie nu al moet kunnen mailen", () => {
    expect(desiredAccountState({ hasCurrentPost: false, kiesploeg: { mailboxActive: true } })).toBe(
      "FULL",
    );
  });

  it("laat een post winnen van de kiesploeg", () => {
    // Op 15 juli treedt de ploeg aan: vanaf dan telt de post, ook al staat het
    // kiesploeglidmaatschap er nog.
    expect(
      desiredAccountState({ hasCurrentPost: true, kiesploeg: { mailboxActive: false } }),
    ).toBe("FULL");
  });

  it("heeft geen mening over wie nergens meer in zit", () => {
    // Dit is het vertrekkende praesidium na 15 juli. `null` betekent "niet
    // aanraken"; zou hier RESTRICTED staan, dan verloor dat hele praesidium in
    // één reconcile zijn mailbox.
    expect(desiredAccountState({ hasCurrentPost: false, kiesploeg: null })).toBeNull();
  });
});
