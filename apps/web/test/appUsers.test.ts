import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));

import { appUserTotals, filterAppUsers, parsePopulation, parseStatus, type AppUserRow } from "@/lib/app-users";

const now = new Date("2026-11-26T12:00:00Z");
const app = (lastSeenAt: string, platforms: Array<"ios" | "android"> = ["ios"]) => ({
  platforms,
  firstSeenAt: new Date("2026-11-01T12:00:00Z"),
  lastSeenAt: new Date(lastSeenAt),
  pushEnabled: true,
  appVersion: "1.2.0",
});
const person = (name: string, extra: Partial<AppUserRow> = {}): AppUserRow => ({
  userId: name,
  name,
  email: `${name.toLowerCase()}@example.com`,
  rNumber: null,
  posts: [],
  app: null,
  ...extra,
});

const rows: AppUserRow[] = [
  person("Bram", { app: app("2026-11-25T12:00:00Z", ["ios", "android"]), posts: ["IT"] }),
  person("Anna"),
  person("Cas", { app: app("2026-09-01T12:00:00Z", ["android"]) }),
  person("Dirk", { posts: ["Cultuur"] }),
];

describe("appUserTotals", () => {
  it("telt wie de app heeft, per platform en wie ze een maand niet opende", () => {
    expect(appUserTotals(rows, now)).toEqual({ total: 4, withApp: 2, ios: 1, android: 2, dormant: 1 });
  });
});

describe("filterAppUsers", () => {
  it("zet wie de app niet heeft bovenaan, en sorteert daarbinnen op naam", () => {
    expect(filterAppUsers(rows, "alle", "").map((row) => row.name)).toEqual(["Anna", "Dirk", "Bram", "Cas"]);
  });

  it("filtert op met en zonder de app", () => {
    expect(filterAppUsers(rows, "met", "").map((row) => row.name)).toEqual(["Bram", "Cas"]);
    expect(filterAppUsers(rows, "zonder", "").map((row) => row.name)).toEqual(["Anna", "Dirk"]);
  });

  it("zoekt in naam, e-mail en post", () => {
    expect(filterAppUsers(rows, "alle", "cultuur").map((row) => row.name)).toEqual(["Dirk"]);
    expect(filterAppUsers(rows, "alle", "CAS@").map((row) => row.name)).toEqual(["Cas"]);
  });
});

describe("parsers", () => {
  it("valt terug op het praesidium en op iedereen", () => {
    expect(parsePopulation(undefined)).toBe("praesidium");
    expect(parsePopulation("leden")).toBe("leden");
    expect(parsePopulation("x")).toBe("praesidium");
    expect(parseStatus("zonder")).toBe("zonder");
    expect(parseStatus("x")).toBe("alle");
  });
});
