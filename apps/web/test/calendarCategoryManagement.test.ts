import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  path.join(process.cwd(), "app/[locale]/admin/kalender/categorieen/page.tsx"),
  "utf8",
);
const formSource = readFileSync(
  path.join(process.cwd(), "app/[locale]/admin/kalender/categorieen/CategoryForm.tsx"),
  "utf8",
);

describe("calendar category management UI", () => {
  it("separates ordinary categories from target audiences with concrete examples", () => {
    expect(pageSource).toContain('"Gewone categorieën"');
    expect(pageSource).toContain('"Ordinary categories"');
    expect(pageSource).toContain('"Doelgroepen"');
    expect(pageSource).toContain('"Target audiences"');
    expect(pageSource).toContain("Career, Feest en Ontspanning");
    expect(pageSource).toContain("Career, Party and Recreation");
    expect(pageSource).toContain("Eerstejaars, Internationals en Laatstejaars");
    expect(pageSource).toContain("First years, Internationals and Last years");
  });

  it("offers distinctly labelled creation forms for both concepts", () => {
    expect(pageSource).toContain('kind="category"');
    expect(pageSource).toContain('kind="audience"');
    expect(formSource).toContain('"Categorie toevoegen"');
    expect(formSource).toContain('"Add category"');
    expect(formSource).toContain('"Doelgroep toevoegen"');
    expect(formSource).toContain('"Add audience"');
    expect(formSource).toContain('<option value="LAST_YEARS">');
  });
});
