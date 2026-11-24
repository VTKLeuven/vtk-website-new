import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));

import { canSeeTransport, weekStartFor } from "@/lib/app-api/transport";
import { driverColors, driverInitials, NO_DRIVER_FILL } from "@/lib/app-api/transportColors";

/**
 * De transportplanning in de app: wie ze ziet volgt `canSeeTripDetails` in
 * apps/logistiek, en niet "wie ingelogd is".
 */
type Session = Parameters<typeof canSeeTransport>[0];
const session = (overrides: { permissions?: string[]; groups?: { type: string }[]; isSuperAdmin?: boolean }) =>
  ({
    user: { id: "u1", isSuperAdmin: overrides.isSuperAdmin ?? false },
    permissions: overrides.permissions ?? [],
    groups: overrides.groups ?? [],
  }) as unknown as Session;

describe("transportplanning in de app", () => {
  it("is er voor het praesidium, werkgroepen, jaarwerkingen en het team", () => {
    expect(canSeeTransport(session({ groups: [{ type: "PRAESIDIUM" }] }))).toBe(true);
    expect(canSeeTransport(session({ groups: [{ type: "WERKGROEP" }] }))).toBe(true);
    expect(canSeeTransport(session({ groups: [{ type: "JAARWERKING" }] }))).toBe(true);
    expect(canSeeTransport(session({ permissions: ["logistiek.manage"] }))).toBe(true);
    expect(canSeeTransport(session({ permissions: ["logistiek.helpers"] }))).toBe(true);
    expect(canSeeTransport(session({ isSuperAdmin: true }))).toBe(true);
  });

  it("is er niet voor een gewone student", () => {
    expect(canSeeTransport(session({}))).toBe(false);
    expect(canSeeTransport(session({ groups: [{ type: "POC" }] }))).toBe(false);
  });

  it("begint de week op maandag, in Brussel", () => {
    expect(weekStartFor("2026-11-26")).toBe("2026-11-23");
    expect(weekStartFor("2026-11-29")).toBe("2026-11-23");
    expect(weekStartFor("2026-11-30")).toBe("2026-11-30");
    expect(weekStartFor("geen datum", new Date("2026-11-24T23:30:00Z"))).toBe("2026-11-23");
  });

  it("kleurt een rit zoals logistiek.vtk.be: de chauffeur, of het neutrale grijs", () => {
    expect(driverColors(null)).toEqual({ fill: NO_DRIVER_FILL, tone: null });
    const auto = driverColors("user-1");
    expect(auto).toEqual(driverColors("user-1"));
    expect(auto.fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(auto.tone).toMatch(/^#[0-9a-f]{6}$/);
    // Een gekozen paletkleur wint van de hash; Hemelblauw is kleur 1.
    expect(driverColors("user-1", { colorIndex: 1, customColor: null }).fill).toBe("#cfe0ff");
    // De toon van het bolletje is donkerder dan de vulling.
    const toneLuma = parseInt(auto.tone!.slice(1, 3), 16) + parseInt(auto.tone!.slice(3, 5), 16);
    const fillLuma = parseInt(auto.fill.slice(1, 3), 16) + parseInt(auto.fill.slice(3, 5), 16);
    expect(toneLuma).toBeLessThan(fillLuma);
    expect(driverColors("user-1", { colorIndex: null, customColor: "200,55,35" }).fill).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("maakt initialen zoals de blokken op de site", () => {
    expect(driverInitials("Arne Janssens")).toBe("AJ");
    expect(driverInitials("Lotte")).toBe("LO");
    expect(driverInitials("Alice (test logistiek)")).toBe("AL");
  });
});

