import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/ticketing/geocode";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: URL) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
    handler(new URL(input instanceof URL ? input.href : String(input)))
  ) as unknown as typeof fetch;
}

describe("geocodeAddress", () => {
  it("returns coordinates for a resolved address", async () => {
    mockFetch((url) => {
      expect(url.searchParams.get("q")).toBe("Naamsestraat 22, Leuven");
      // Zonder land-hint levert een straatnaam wereldwijd resultaten op.
      expect(url.searchParams.get("countrycodes")).toContain("be");
      return Response.json([{ lat: "50.8776", lon: "4.7009", display_name: "Naamsestraat 22, Leuven" }]);
    });
    await expect(geocodeAddress("Naamsestraat 22, Leuven")).resolves.toMatchObject({
      latitude: 50.8776,
      longitude: 4.7009,
    });
  });

  // Een event opslaan mag nooit stuklopen op de geocoder: zonder coördinaten
  // bewaart de actie enkel het adres en valt de geofence weg.
  it("returns null instead of throwing when the lookup fails", async () => {
    mockFetch(() => new Response("nope", { status: 503 }));
    await expect(geocodeAddress("Theokot")).resolves.toBeNull();

    mockFetch(() => Response.json([]));
    await expect(geocodeAddress("Bestaat niet")).resolves.toBeNull();

    mockFetch(() => {
      throw new Error("network down");
    });
    await expect(geocodeAddress("Leuven")).resolves.toBeNull();
  });

  it("skips the request entirely for an empty address", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    await expect(geocodeAddress("   ")).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
