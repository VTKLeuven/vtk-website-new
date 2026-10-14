import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthGroup, SessionPayload } from "@vtk/auth";

const findMany = vi.fn();
vi.mock("@vtk/db", () => ({ prisma: { groupRole: { findMany } } }));

const { werkgroepenWithOwnMemberRights, grantReachesMember } = await import("@/lib/werkgroepMembers");

function group(id: string, role: AuthGroup["role"], type: AuthGroup["type"] = "WERKGROEP"): AuthGroup {
  return { id, code: id.toUpperCase(), slug: id, nameNl: id, nameEn: id, role, type };
}

function session(groups: AuthGroup[], permissions = ["werkgroepen.manageOwnMembers"]): SessionPayload {
  return {
    token: "token",
    expiresAt: new Date(0).toISOString(),
    user: {
      id: "u1",
      email: "g3@example.test",
      name: "G3",
      avatarKey: null,
      locale: "NL",
      isSuperAdmin: false,
      onboarded: true,
      studyConfirmedYear: 2026,
      isStudent: true,
      googleLinked: true,
      googleLinkDeferredAt: null,
    },
    permissions,
    roleIds: [],
    groups,
  };
}

beforeEach(() => findMany.mockReset());

describe("grantReachesMember", () => {
  it("geeft een LEADER-grant enkel aan de verantwoordelijke", () => {
    expect(grantReachesMember(["LEADER"], "LEAD")).toBe(true);
    expect(grantReachesMember(["LEADER"], "MEMBER")).toBe(false);
    expect(grantReachesMember(["DEFAULT"], "MEMBER")).toBe(true);
    expect(grantReachesMember([], "LEAD")).toBe(false);
  });
});

describe("werkgroepenWithOwnMemberRights", () => {
  it("laat de G3 de leden van zijn werkgroep beheren", async () => {
    findMany.mockResolvedValue([{ groupId: "chemix", kind: "LEADER" }]);
    const allowed = await werkgroepenWithOwnMemberRights(session([group("chemix", "LEAD")]));
    expect([...allowed]).toEqual(["chemix"]);
  });

  it("geeft een gewoon lid niets wanneer het recht enkel aan de verantwoordelijke hangt", async () => {
    findMany.mockResolvedValue([{ groupId: "chemix", kind: "LEADER" }]);
    const allowed = await werkgroepenWithOwnMemberRights(session([group("chemix", "MEMBER")]));
    expect(allowed.size).toBe(0);
  });

  it("laat het recht niet overlopen naar een werkgroep waar je gewoon lid bent", async () => {
    // G3 van Chemix, gewoon lid van Revue: het recht staat in de sessie dankzij
    // Chemix, maar Revue verleent het enkel aan haar eigen verantwoordelijke.
    findMany.mockResolvedValue([
      { groupId: "chemix", kind: "LEADER" },
      { groupId: "revue", kind: "LEADER" },
    ]);
    const allowed = await werkgroepenWithOwnMemberRights(
      session([group("chemix", "LEAD"), group("revue", "MEMBER")]),
    );
    expect([...allowed]).toEqual(["chemix"]);
  });

  it("telt geen werkgroep die het recht zelf niet verleent", async () => {
    findMany.mockResolvedValue([{ groupId: "chemix", kind: "LEADER" }]);
    const allowed = await werkgroepenWithOwnMemberRights(
      session([group("chemix", "LEAD"), group("revue", "LEAD")]),
    );
    expect([...allowed]).toEqual(["chemix"]);
  });

  it("negeert praesidiumposten en vraagt niets op zonder het recht", async () => {
    expect((await werkgroepenWithOwnMemberRights(session([group("it", "LEAD", "PRAESIDIUM")]))).size).toBe(0);
    expect((await werkgroepenWithOwnMemberRights(session([group("chemix", "LEAD")], []))).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
