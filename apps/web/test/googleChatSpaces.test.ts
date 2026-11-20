import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GoogleError } from "@/lib/google/client";
import { chatErrorCode, chatRoleLabel, memberView, parseChatRole } from "@/lib/google/chatSpaces";
import type { AddressOwner, DirectoryAddresses } from "@/lib/google/aliases";

const jan: AddressOwner = {
  kind: "user",
  id: "111",
  email: "jan@vtk.be",
  name: "Jan Peeters",
  aliases: [],
  suspended: true,
  managedBySite: false,
};
const loko: AddressOwner = {
  kind: "group",
  id: "03abc",
  email: "loko@vtk.be",
  name: "LOKO",
  aliases: [],
  suspended: false,
  managedBySite: true,
};
const directory: DirectoryAddresses = {
  owners: [jan, loko],
  aliases: [],
  byAddress: new Map([
    ["jan@vtk.be", jan],
    ["loko@vtk.be", loko],
  ]),
  byId: new Map([
    ["users/111", jan],
    ["groups/03abc", loko],
  ]),
};

describe("leden van een chatruimte", () => {
  it("geeft een lid zijn naam en adres uit de directory", () => {
    expect(
      memberView(
        { name: "spaces/S/members/111", role: "ROLE_MANAGER", state: "JOINED", member: { name: "users/111", type: "HUMAN" } },
        directory,
      ),
    ).toEqual({
      membershipName: "spaces/S/members/111",
      kind: "user",
      email: "jan@vtk.be",
      name: "Jan Peeters",
      role: "ROLE_MANAGER",
      invited: false,
      suspended: true,
    });
  });

  it("herkent een groep, en valt zonder directory terug op het id", () => {
    const group = { name: "spaces/S/members/g", groupMember: { name: "groups/03abc" } };
    expect(memberView(group, directory)).toMatchObject({ kind: "group", email: "loko@vtk.be", role: "ROLE_MEMBER" });
    expect(memberView(group, null)).toMatchObject({ kind: "group", email: null, name: "groups/03abc" });
  });

  it("noemt de rollen zoals Chat zelf", () => {
    expect(chatRoleLabel("ROLE_MANAGER", true)).toBe("Eigenaar");
    expect(chatRoleLabel("ROLE_ASSISTANT_MANAGER", true)).toBe("Beheerder");
    expect(parseChatRole("ROLE_OWNER")).toBeNull();
  });

  it("maakt van een fout van Google een melding voor het scherm", () => {
    expect(chatErrorCode(new GoogleError("Aanmelden bij Google is mislukt: unauthorized_client", 401, null))).toBe(
      "CHAT_NOT_DELEGATED",
    );
    expect(chatErrorCode(new GoogleError("forbidden", 403, null))).toBe("CHAT_FORBIDDEN");
    expect(chatErrorCode(new GoogleError("exists", 409, null))).toBe("NAME_TAKEN");
    expect(chatErrorCode(new Error("iets anders"))).toBeNull();
  });
});
