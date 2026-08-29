import { afterEach, describe, expect, it, vi } from "vitest";
import { foreignMarkers, galleryMarker, GALLERY_IDS } from "@vtk/gallery";

/**
 * De scheiding tussen de fotogalerij van vtk.be en die van 't ElixIr.
 *
 * Deze tests staan in `apps/web` en niet in `packages/gallery`, omdat `npm run
 * verify` (en de CI-job) enkel de testsuites van @vtk/web en @vtk/logistiek
 * draait. Hier lopen ze mee; in het pakket zouden ze stil blijven staan.
 *
 * Wat ze bewaken: VTK wil op de hoofdsite enkel geselecteerd werk, de fakbar
 * wil alles kunnen posten. Als die twee ooit in elkaar overlopen, is dat de
 * ene keer dat het echt fout zit.
 */
afterEach(() => vi.unstubAllEnvs());

describe("markers per galerij", () => {
  it("geeft elke galerij een eigen merker", () => {
    const markers = GALLERY_IDS.map(galleryMarker);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it("gebruikt [gallery] en [fakbar] als standaard", () => {
    vi.stubEnv("GALLERY_ALBUM_MARKER", "");
    vi.stubEnv("IMMICH_ALBUM_MARKER", "");
    vi.stubEnv("GALLERY_FAKBAR_ALBUM_MARKER", "");
    expect(galleryMarker("main")).toBe("[gallery]");
    expect(galleryMarker("fakbar")).toBe("[fakbar]");
  });

  it("aanvaardt de oude IMMICH_ALBUM_MARKER voor de hoofdgalerij", () => {
    vi.stubEnv("GALLERY_ALBUM_MARKER", "");
    vi.stubEnv("IMMICH_ALBUM_MARKER", "[vtk]");
    expect(galleryMarker("main")).toBe("[vtk]");
  });

  it("laat de fakbarmerker niet door die oude variabele overschrijven", () => {
    vi.stubEnv("IMMICH_ALBUM_MARKER", "[vtk]");
    vi.stubEnv("GALLERY_FAKBAR_ALBUM_MARKER", "");
    expect(galleryMarker("fakbar")).toBe("[fakbar]");
  });

  it("noemt de merker van de andere galerij als vreemd", () => {
    vi.stubEnv("GALLERY_ALBUM_MARKER", "");
    vi.stubEnv("IMMICH_ALBUM_MARKER", "");
    vi.stubEnv("GALLERY_FAKBAR_ALBUM_MARKER", "");
    expect(foreignMarkers("main")).toEqual(["[fakbar]"]);
    expect(foreignMarkers("fakbar")).toEqual(["[gallery]"]);
  });

  /**
   * Zet iemand beide merkers op dezelfde waarde, dan zou elk album in beide
   * galerijen zitten. `foreignMarkers` moet die waarde dan niet als vreemd
   * opgeven, want dan sluit de galerij haar eigen albums uit en verdwijnt
   * alles. Beide galerijen tonen dan hetzelfde, wat zichtbaar fout is en dus
   * meteen opgemerkt wordt; stil leeglopen zou dat niet zijn.
   */
  it("sluit zichzelf niet uit wanneer beide merkers gelijk gezet zijn", () => {
    vi.stubEnv("GALLERY_ALBUM_MARKER", "[zelfde]");
    vi.stubEnv("GALLERY_FAKBAR_ALBUM_MARKER", "[zelfde]");
    expect(foreignMarkers("main")).toEqual([]);
    expect(foreignMarkers("fakbar")).toEqual([]);
  });
});

/**
 * De sorteerregel zelf, los van Immich: hoort dit album bij deze galerij?
 * Dezelfde voorwaarden als in `loadSnapshot`.
 */
function belongsTo(description: string, own: string, foreign: string[]): "own" | "ambiguous" | "no" {
  if (!own || !description.includes(own)) return "no";
  return foreign.some((marker) => description.includes(marker)) ? "ambiguous" : "own";
}

describe("een album toewijzen aan een galerij", () => {
  const main = "[gallery]";
  const fakbar = "[fakbar]";

  it("neemt een album met enkel de eigen merker", () => {
    expect(belongsTo("Openingsfeest\n\n[gallery]", main, [fakbar])).toBe("own");
    expect(belongsTo("Cantus\n\n[fakbar]", fakbar, [main])).toBe("own");
  });

  it("houdt een fakbaralbum uit de galerij van vtk.be", () => {
    expect(belongsTo("Cantus\n\n[fakbar]", main, [fakbar])).toBe("no");
  });

  it("houdt een vtk-album uit de fakbargalerij", () => {
    expect(belongsTo("Openingsfeest\n\n[gallery]", fakbar, [main])).toBe("no");
  });

  it("toont een album met twee merkers nergens, maar meldt het wel", () => {
    const description = "Verkeerd\n\n[gallery] [fakbar]";
    expect(belongsTo(description, main, [fakbar])).toBe("ambiguous");
    expect(belongsTo(description, fakbar, [main])).toBe("ambiguous");
  });

  it("negeert een album zonder merker", () => {
    expect(belongsTo("Privéreeks van iemand", main, [fakbar])).toBe("no");
    expect(belongsTo("Privéreeks van iemand", fakbar, [main])).toBe("no");
  });

  it("eist geen merker op wanneer die leeg geconfigureerd is", () => {
    // Een lege merker die alles opeist zou de ene galerij de andere laten
    // opslorpen; liever niets tonen dan alles.
    expect(belongsTo("Om het even wat", "", [fakbar])).toBe("no");
  });
});
