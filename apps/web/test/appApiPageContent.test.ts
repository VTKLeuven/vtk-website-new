import { describe, expect, it } from "vitest";

import { pageContentMarkdown, pageOutline } from "@/lib/app-api/pageContent";

/**
 * Contentpagina's naar de app.
 *
 * De app kent één formaat: Markdown. Op de site staan pagina's in twee vormen,
 * want oudere pagina's zijn nog tiptap-JSON. De terugvalregels hier moeten
 * exact dezelfde zijn als die van `PageView`, anders toont de app een andere
 * taal of een andere versie dan de website voor dezelfde pagina.
 */

const tiptap = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Wat we doen" }] },
    { type: "paragraph", content: [{ type: "text", text: "Van alles." }] },
  ],
};

describe("inhoud van een contentpagina", () => {
  it("geeft de Markdown van de gevraagde taal", () => {
    const page = {
      contentMdNl: "# Hallo",
      contentMdEn: "# Hello",
      contentJsonNl: null,
      contentJsonEn: null,
    };

    expect(pageContentMarkdown(page, "nl")).toBe("# Hallo");
    expect(pageContentMarkdown(page, "en")).toBe("# Hello");
  });

  it("valt voor Engels terug op het Nederlands wanneer er geen Engelse versie is", () => {
    const page = {
      contentMdNl: "# Hallo",
      contentMdEn: null,
      contentJsonNl: null,
      contentJsonEn: null,
    };

    expect(pageContentMarkdown(page, "en")).toBe("# Hallo");
  });

  /**
   * Dit is de regel die het makkelijkst stilzwijgend misgaat. Een pagina die
   * naar Markdown omgezet is en daarna leeggemaakt, heeft `contentMdNl === ""`
   * en nog steeds het oude tiptap-JSON in de database. Die pagina hoort leeg te
   * zijn; zou de lege string als "niets" tellen, dan komt de oude inhoud terug.
   */
  it("laat een lege Markdown het oude tiptap-JSON overrulen", () => {
    const page = {
      contentMdNl: "",
      contentMdEn: null,
      contentJsonNl: tiptap,
      contentJsonEn: null,
    };

    expect(pageContentMarkdown(page, "nl")).toBe("");
  });

  it("zet oud tiptap-JSON om naar Markdown", () => {
    const page = {
      contentMdNl: null,
      contentMdEn: null,
      contentJsonNl: tiptap,
      contentJsonEn: null,
    };

    const markdown = pageContentMarkdown(page, "nl");
    expect(markdown).toContain("## Wat we doen");
    expect(markdown).toContain("Van alles.");
  });

  /**
   * De kop-index komt uit dezelfde Markdown die de app rendert, ook bij een
   * omgezet tiptap-document. Anders zouden de ankers in de rail naar koppen
   * kunnen wijzen die in de omgezette tekst een andere naam kregen.
   */
  it("leidt de kop-index af uit de getoonde tekst", () => {
    const page = {
      contentMdNl: "## Eerste deel\n\nTekst\n\n### Detail\n\n#### Te diep",
      contentMdEn: null,
      contentJsonNl: null,
      contentJsonEn: null,
    };

    expect(pageOutline(page, "nl")).toEqual([
      { id: "sectie-eerste-deel", text: "Eerste deel", level: 2 },
      { id: "sectie-detail", text: "Detail", level: 3 },
    ]);
  });

  it("negeert kopjes binnen een codeblok", () => {
    const page = {
      contentMdNl: "## Echt\n\n```\n## Niet echt\n```\n",
      contentMdEn: null,
      contentJsonNl: null,
      contentJsonEn: null,
    };

    expect(pageOutline(page, "nl").map((item) => item.text)).toEqual(["Echt"]);
  });

  it("leidt hetzelfde anker af als de site", () => {
    const page = {
      contentMdNl: "## Praktisch & handig",
      contentMdEn: null,
      contentJsonNl: null,
      contentJsonEn: null,
    };

    // Zelfde vorm als `headingId()` in lib/pageOutline.ts: kleine letters,
    // accenten weg, alles wat geen letter of cijfer is wordt een streepje.
    expect(pageOutline(page, "nl")[0].id).toBe("sectie-praktisch-handig");
  });
});
