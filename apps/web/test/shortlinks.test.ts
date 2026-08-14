import { describe, expect, it } from "vitest";
import { shortlinkDisplayHost, shortlinkPublicUrl } from "@/lib/shortlinks";

describe("shortlink URLs", () => {
  it.each([
    ["vtk.be", "on.vtk.be"],
    ["www.vtk.be", "on.vtk.be"],
    ["main-dev.vtk.be", "on.main-dev.vtk.be"],
    ["on.vtk.be", "on.vtk.be"],
    ["localhost:3000", "on.localhost:3000"],
  ])("maps %s to %s", (requestHost, expected) => {
    expect(shortlinkDisplayHost(requestHost)).toBe(expected);
  });

  it("builds the exact public URL encoded by the QR code", () => {
    expect(shortlinkPublicUrl("www.vtk.be", "welkom")).toBe("https://on.vtk.be/welkom");
  });
});
