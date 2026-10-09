import { describe, expect, it } from "vitest";
import { publicRequestHost } from "@/lib/requestHost";

describe("publicRequestHost", () => {
  it("prefers the host Caddy forwards over the internal one", () => {
    const headers = new Headers({ host: "localhost:3000", "x-forwarded-host": "vtk.be" });
    expect(publicRequestHost(headers, "fallback")).toBe("vtk.be");
  });

  it("takes the first value of a forwarded list", () => {
    const headers = new Headers({ host: "localhost:3000", "x-forwarded-host": "vtk.be, proxy" });
    expect(publicRequestHost(headers, "fallback")).toBe("vtk.be");
  });

  it("falls back to host without a proxy in front", () => {
    expect(publicRequestHost(new Headers({ host: "localhost:3000" }), "fallback")).toBe(
      "localhost:3000",
    );
  });

  it("falls back to the given host when neither header is there", () => {
    expect(publicRequestHost(new Headers(), "vtk.be")).toBe("vtk.be");
  });
});
