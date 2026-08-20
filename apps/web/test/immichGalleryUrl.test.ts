import { afterEach, describe, expect, it, vi } from "vitest";
import { immichWebUrl } from "@/lib/immich-gallery";

afterEach(() => vi.unstubAllEnvs());

describe("Immich admin link", () => {
  it("defaults to the public Immich host instead of the internal API host", () => {
    vi.stubEnv("GALLERY_IMMICH_WEB_URL", "");
    vi.stubEnv("GALLERY_IMMICH_API_URL", "http://localhost:2283/api");
    expect(immichWebUrl()).toBe("https://immich.vtk.be");
  });

  it("accepts an explicit web URL and removes trailing slashes", () => {
    vi.stubEnv("GALLERY_IMMICH_WEB_URL", "https://photos.example.test///");
    expect(immichWebUrl()).toBe("https://photos.example.test");
  });
});
