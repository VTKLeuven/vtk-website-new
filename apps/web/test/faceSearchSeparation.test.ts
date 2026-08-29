import { afterEach, describe, expect, it, vi } from "vitest";
import { faceSearchConfig, GALLERY_IDS } from "@vtk/gallery";

/**
 * De grenzen rond de gezichtszoekfunctie.
 *
 * Deze staan hier en niet in `packages/gallery` omdat `npm run verify` enkel de
 * suites van @vtk/web en @vtk/logistiek draait; zie `gallerySeparation.test.ts`.
 *
 * Wat ze bewaken faalt allemaal stil. Een vlag die per ongeluk aanstaat zet
 * biometrische verwerking open zonder dat er iets zichtbaar verandert, en een
 * gedeeld toestel-id wist de selfie van de ene galerij onder een lopende
 * zoekopdracht van de andere vandaan.
 */
afterEach(() => vi.unstubAllEnvs());

function stubFlags(main: string, fakbar: string) {
  vi.stubEnv("GALLERY_FACE_SEARCH_ENABLED", main);
  vi.stubEnv("GALLERY_FAKBAR_FACE_SEARCH_ENABLED", fakbar);
}

describe("de aan/uit-vlag per galerij", () => {
  it("staat standaard uit wanneer er niets gezet is", () => {
    stubFlags("", "");
    expect(faceSearchConfig("main").enabled).toBe(false);
    expect(faceSearchConfig("fakbar").enabled).toBe(false);
  });

  /**
   * Exact `true` en niets anders. `"1"`, `"yes"` of `"TRUE"` in een .env zijn
   * makkelijk te typen en zouden een verwerking openzetten die iemand niet
   * bedoeld heeft aan te zetten.
   */
  it.each(["1", "yes", "TRUE", "True", "on", " true"])("aanvaardt %o niet als aan", (value) => {
    stubFlags(value, value);
    expect(faceSearchConfig("main").enabled).toBe(false);
    expect(faceSearchConfig("fakbar").enabled).toBe(false);
  });

  it("gaat aan bij exact true", () => {
    stubFlags("true", "true");
    expect(faceSearchConfig("main").enabled).toBe(true);
    expect(faceSearchConfig("fakbar").enabled).toBe(true);
  });

  it("laat de hoofdsite de fakbar niet mee aanzetten", () => {
    stubFlags("true", "");
    expect(faceSearchConfig("main").enabled).toBe(true);
    expect(faceSearchConfig("fakbar").enabled).toBe(false);
  });

  it("laat de fakbar de hoofdsite niet mee aanzetten", () => {
    stubFlags("", "true");
    expect(faceSearchConfig("main").enabled).toBe(false);
    expect(faceSearchConfig("fakbar").enabled).toBe(true);
  });
});

describe("het toestel-id van de tijdelijke selfie", () => {
  /**
   * Het opruimen van blijven hangende uploads verwijdert in Immich alles met
   * dit toestel-id dat ouder is dan de TTL. Delen twee galerijen die waarde,
   * dan wist de opruiming van de ene de selfie van de andere weg terwijl daar
   * nog een zoekopdracht op loopt.
   */
  it("verschilt per galerij", () => {
    vi.stubEnv("GALLERY_FACE_SEARCH_DEVICE_ID", "");
    vi.stubEnv("GALLERY_FAKBAR_FACE_SEARCH_DEVICE_ID", "");
    const deviceIds = GALLERY_IDS.map((id) => faceSearchConfig(id).deviceId);
    expect(new Set(deviceIds).size).toBe(deviceIds.length);
    expect(deviceIds.every(Boolean)).toBe(true);
  });

  it("is per galerij apart te overschrijven", () => {
    vi.stubEnv("GALLERY_FACE_SEARCH_DEVICE_ID", "eigen-hoofdsite");
    vi.stubEnv("GALLERY_FAKBAR_FACE_SEARCH_DEVICE_ID", "eigen-fakbar");
    expect(faceSearchConfig("main").deviceId).toBe("eigen-hoofdsite");
    expect(faceSearchConfig("fakbar").deviceId).toBe("eigen-fakbar");
  });
});

describe("de gedeelde afstelling", () => {
  it("gebruikt dezelfde Immich-databank voor beide galerijen", () => {
    vi.stubEnv("GALLERY_DATABASE_HOST", "immich-database");
    vi.stubEnv("GALLERY_DATABASE_NAME", "immich");
    vi.stubEnv("GALLERY_DATABASE_USER", "immich");
    const main = faceSearchConfig("main").database;
    const fakbar = faceSearchConfig("fakbar").database;
    expect(fakbar).toEqual(main);
  });

  it("valt terug op veilige standaarden bij onzin in de env", () => {
    vi.stubEnv("GALLERY_FACE_SEARCH_MAX_UPLOAD_BYTES", "nogal wat");
    vi.stubEnv("GALLERY_FACE_SEARCH_TIMEOUT_SECONDS", "-30");
    vi.stubEnv("GALLERY_FACE_MATCH_MAX_DISTANCE", "");
    const config = faceSearchConfig("fakbar");
    expect(config.maxUploadBytes).toBe(8 * 1024 * 1024);
    expect(config.timeoutSeconds).toBe(240);
    expect(config.maxDistance).toBe(0.42);
  });
});
