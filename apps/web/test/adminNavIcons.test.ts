import { describe, expect, it } from "vitest";

import { ADMIN_NAV_ICONS, adminNavIconMarkup } from "@/lib/admin-nav-icons";

describe("adminNavIconMarkup", () => {
  it("geeft het pictogram van de zijbalk als svg-tekst", () => {
    const svg = adminNavIconMarkup("door");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('<path d="M3 21h18"></path>');
    expect(svg).not.toContain("className");
  });

  it("valt terug op het pictogram van een groep, zoals de zijbalk", () => {
    expect(adminNavIconMarkup("bestaat-niet")).toBe(adminNavIconMarkup("groups"));
  });

  it("zet elk pictogram om zonder lege uitvoer", () => {
    for (const key of Object.keys(ADMIN_NAV_ICONS)) {
      expect(adminNavIconMarkup(key)).toMatch(/^<svg[^>]*>.+<\/svg>$/);
    }
  });
});
