import { describe, expect, it } from "vitest";
import { nameKey, suggestLinks, type DirectoryUser, type WebsiteUser } from "@/lib/google/linking";

function user(id: string, firstName: string, lastName: string): WebsiteUser {
  return { id, name: `${firstName} ${lastName}`, firstName, lastName };
}

function account(id: string, email: string, given: string, family: string): DirectoryUser {
  return { id, primaryEmail: email, givenName: given, familyName: family };
}

describe("nameKey", () => {
  it("negeert volgorde, hoofdletters en accenten", () => {
    expect(nameKey("Noël", "De Smet")).toBe(nameKey("de smet", "noel"));
  });

  it("houdt verschillende namen uit elkaar", () => {
    expect(nameKey("Jan", "Peeters")).not.toBe(nameKey("Jan", "Peters"));
  });
});

describe("suggestLinks", () => {
  it("stelt een eenduidige naamovereenkomst voor", () => {
    const result = suggestLinks({
      users: [user("u1", "Jan", "Peeters")],
      directory: [account("g1", "jan.peeters@vtk.be", "Jan", "Peeters")],
    });
    expect(result.matches).toEqual([
      {
        userId: "u1",
        userName: "Jan Peeters",
        googleUserId: "g1",
        googleEmail: "jan.peeters@vtk.be",
      },
    ]);
    expect(result.ambiguous).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it("stelt niets voor bij naamgenoten", () => {
    const result = suggestLinks({
      users: [user("u1", "Jan", "Peeters"), user("u2", "Jan", "Peeters")],
      directory: [account("g1", "jan.peeters@vtk.be", "Jan", "Peeters")],
    });
    expect(result.matches).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates.map((c) => c.id)).toEqual(["u1", "u2"]);
  });

  it("stelt niets voor wanneer twee accounts dezelfde naam dragen", () => {
    // Een oud en een nieuw account van dezelfde persoon: dan mag de sync niet
    // gokken welk van de twee het echte is.
    const result = suggestLinks({
      users: [user("u1", "Jan", "Peeters")],
      directory: [
        account("g1", "jan.peeters@vtk.be", "Jan", "Peeters"),
        account("g2", "jan.peeters2@vtk.be", "Jan", "Peeters"),
      ],
    });
    expect(result.matches).toEqual([]);
    expect(result.ambiguous).toHaveLength(2);
  });

  it("zet een account zonder passend lid bij unmatched", () => {
    const result = suggestLinks({
      users: [user("u1", "Jan", "Peeters")],
      directory: [account("g9", "info@vtk.be", "Info", "VTK")],
    });
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([
      { googleUserId: "g9", googleEmail: "info@vtk.be", label: "info@vtk.be" },
    ]);
  });

  it("valt terug op de volledige naam wanneer voor- en achternaam ontbreken", () => {
    const result = suggestLinks({
      users: [{ id: "u1", name: "Ann De Smet", firstName: null, lastName: null }],
      directory: [{ id: "g1", primaryEmail: "ann.desmet@vtk.be", fullName: "Ann De Smet" }],
    });
    expect(result.matches.map((m) => m.userId)).toEqual(["u1"]);
  });
});
