import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));

import { canSeeTransport, weekStartFor } from "@/lib/app-api/transport";

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
});
