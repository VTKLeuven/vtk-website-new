import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@vtk/auth";
import {
  describePermission,
  permissionCategoryLabel,
  permissionInfoByCode,
} from "@/lib/permissionCategories";

describe("permissiecategorieën", () => {
  // De registry in `packages/db/src/permissions.ts` is de bron van waarheid; de
  // labels staan hier. Zonder deze test voegt iemand een categorie toe en toont
  // /admin/gebruikers de rauwe sleutel ("fakbar") in plaats van een naam.
  it("geeft elke categorie uit de registry een leesbare naam", () => {
    for (const category of new Set(PERMISSIONS.map((p) => p.category))) {
      // De terugval in `permissionCategoryLabel` is er voor rijden die enkel in
      // de database staan; een registrycategorie mag er nooit op terugvallen.
      expect(permissionCategoryLabel(category, "nl"), category).not.toBe(category);
      expect(permissionCategoryLabel(category, "en"), category).not.toBe(category);
    }
  });

  it("vertaalt de labels per taal", () => {
    expect(permissionCategoryLabel("account", "nl")).toBe("Account");
    expect(permissionCategoryLabel("account", "en")).toBe("Account");
    expect(permissionCategoryLabel("general", "nl")).toBe("Website-inhoud");
    expect(permissionCategoryLabel("general", "en")).toBe("Website content");
  });

  it("valt voor een onbekende categorie terug op de sleutel zelf", () => {
    expect(permissionCategoryLabel("staat-niet-in-de-registry", "nl")).toBe(
      "staat-niet-in-de-registry",
    );
  });

  it("geeft elke permissie een label en een categorienaam in beide talen", () => {
    const nl = permissionInfoByCode("nl");
    const en = permissionInfoByCode("en");
    expect(nl.size).toBe(PERMISSIONS.length);

    for (const permission of PERMISSIONS) {
      expect(nl.get(permission.code)?.label).toBe(permission.labelNl);
      expect(en.get(permission.code)?.label).toBe(permission.labelEn);
      expect(nl.get(permission.code)?.categoryLabel, permission.code).not.toBe(
        permission.category,
      );
    }
  });

  it("kent de handtekeninggenerator zijn eigen recht toe", () => {
    expect(permissionInfoByCode("nl").get("signature.generate")?.label).toBe(
      "E-mailhandtekening genereren",
    );
    expect(describePermission("signature.generate", "en").label).toBe("Generate email signature");
    expect(describePermission("signature.generate", "nl").category).toBe("account");
  });
});
