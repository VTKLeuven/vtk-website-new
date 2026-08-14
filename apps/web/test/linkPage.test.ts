import { describe, expect, it } from "vitest";
import {
  DEFAULT_LINK_PAGE_CONFIG,
  linkPageConfigSchema,
  parseLinkPageConfig,
  socialHref,
} from "@/lib/link-page";

describe("Linktree-configuratie", () => {
  it("valt veilig terug op een bruikbare standaard", () => {
    expect(parseLinkPageConfig(null)).toEqual(DEFAULT_LINK_PAGE_CONFIG);
    expect(parseLinkPageConfig({ title: "onvolledig" })).toEqual(DEFAULT_LINK_PAGE_CONFIG);
  });

  it("bewaart de ingestelde volgorde en verborgen knoppen", () => {
    const input = {
      ...DEFAULT_LINK_PAGE_CONFIG,
      links: [
        { id: "twee", title: "Tweede", url: "https://example.com/twee", enabled: false },
        { id: "een", title: "Eerste", url: "/kalender", enabled: true },
      ],
    };

    expect(parseLinkPageConfig(input).links).toEqual(input.links);
  });

  it("staat enkel veilige linkprotocollen en site-relatieve paden toe", () => {
    const withUrl = (url: string) => ({
      ...DEFAULT_LINK_PAGE_CONFIG,
      links: [{ id: "test", title: "Test", url, enabled: true }],
    });

    expect(linkPageConfigSchema.safeParse(withUrl("/kalender")).success).toBe(true);
    expect(linkPageConfigSchema.safeParse(withUrl("mailto:info@vtk.be")).success).toBe(true);
    expect(linkPageConfigSchema.safeParse(withUrl("javascript:alert(1)")).success).toBe(false);
    expect(linkPageConfigSchema.safeParse(withUrl("//evil.example")).success).toBe(false);
  });

  it("weigert dubbele knop-id's", () => {
    const duplicate = {
      ...DEFAULT_LINK_PAGE_CONFIG,
      links: [
        { id: "zelfde", title: "Een", url: "/", enabled: true },
        { id: "zelfde", title: "Twee", url: "/kalender", enabled: true },
      ],
    };

    expect(linkPageConfigSchema.safeParse(duplicate).success).toBe(false);
  });

  it("maakt alleen van het e-mailadres een mailto-link", () => {
    expect(socialHref("email", "info@vtk.be")).toBe("mailto:info@vtk.be");
    expect(socialHref("instagram", "https://instagram.com/vtk")).toBe(
      "https://instagram.com/vtk",
    );
  });
});
