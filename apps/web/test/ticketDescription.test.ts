import { describe, expect, it } from "vitest";
import { ticketDescriptionExcerpt } from "@/lib/ticketing/description";

describe("ticketDescriptionExcerpt", () => {
  it("geeft de eerste alinea als platte tekst", () => {
    expect(
      ticketDescriptionExcerpt("Een **cantus** in de [Salons](https://example.com).\n\nTweede alinea."),
    ).toBe("Een cantus in de Salons.");
  });

  it("slaat een kop en een losse afbeelding bovenaan over", () => {
    expect(
      ticketDescriptionExcerpt("## Praktisch\n\n![Affiche](/api/media/a.jpg)\n\n- Deuren om 20u\n- Drankkaart"),
    ).toBe("Deuren om 20u Drankkaart");
  });

  it("zet een platte beschrijving met regelovergangen op één regel", () => {
    expect(ticketDescriptionExcerpt("Deuren om 20u\nEinde om 2u")).toBe("Deuren om 20u Einde om 2u");
  });

  it("is leeg zonder beschrijving", () => {
    expect(ticketDescriptionExcerpt(null)).toBe("");
    expect(ticketDescriptionExcerpt("")).toBe("");
    expect(ticketDescriptionExcerpt("# Enkel een kop")).toBe("");
  });
});
