import { describe, expect, it } from "vitest";
import {
  type ActivityPerson,
  classifyGroups,
  groupActivity,
  personStatus,
} from "@/lib/google/activity";

/**
 * Of er in een groepsadres nog iemand zit die nu bij de kring hoort. Dit
 * bepaalt welke groepen op /admin/groepsadressen onder "Niemand meer actief"
 * vallen, en dus wat iemand in bulk uit Google verwijdert.
 */

const YEARS = { workingYear: 2026, studyYear: 2026 };

function person(over: Partial<ActivityPerson> = {}): ActivityPerson {
  return {
    name: "Jan Peeters",
    lastPostYear: null,
    inActiveKiesploeg: false,
    isStudent: true,
    studyConfirmedYear: null,
    active: true,
    ...over,
  };
}

describe("personStatus", () => {
  it("een post dit werkingsjaar is actief", () => {
    expect(personStatus(person({ lastPostYear: 2026 }), YEARS).kind).toBe("post");
  });

  it("een lopende kiesploeg telt als post, ook zonder lidmaatschap", () => {
    expect(personStatus(person({ inActiveKiesploeg: true }), YEARS).kind).toBe("post");
  });

  it("een studie die dit jaar bevestigd is, is actief", () => {
    expect(personStatus(person({ studyConfirmedYear: 2026 }), YEARS).kind).toBe("student");
  });

  it("een bevestiging telt niet voor wie geen student meer is", () => {
    const status = personStatus(person({ isStudent: false, studyConfirmedYear: 2026, lastPostYear: 2022 }), YEARS);
    expect(status).toEqual({ kind: "former", name: "Jan Peeters", lastYear: 2022 });
  });

  it("een oud-lid krijgt het jongste jaar waarin het nog actief was", () => {
    const status = personStatus(person({ lastPostYear: 2022, studyConfirmedYear: 2024 }), YEARS);
    expect(status).toEqual({ kind: "former", name: "Jan Peeters", lastYear: 2024 });
  });

  it("een gedeactiveerd account is nooit actief, ook met een post", () => {
    expect(personStatus(person({ lastPostYear: 2026, active: false }), YEARS).kind).toBe("former");
  });
});

describe("groupActivity", () => {
  it("telt actieve leden en onthoudt het jongste jaar", () => {
    expect(
      groupActivity([
        { kind: "former", name: "a", lastYear: 2021 },
        { kind: "former", name: "b", lastYear: 2023 },
        { kind: "unknown" },
      ]),
    ).toEqual({ total: 3, active: 0, lastYear: 2023 });
  });
});

describe("classifyGroups", () => {
  it("een geneste groep is actief wanneer ze zelf rechtstreeks actieve leden heeft", () => {
    const people = new Map([
      ["g5@vtk.be.lid", person({ lastPostYear: 2026 })],
      ["oud@vtk.be", person({ lastPostYear: 2019 })],
    ]);
    const result = classifyGroups(
      [
        // De geneste groep staat bewust na de groep die haar bevat.
        { id: "a", email: "communicatie_1314@vtk.be", emails: ["g5@vtk.be", "lustrum@vtk.be", "x@gmail.com"] },
        { id: "g5", email: "g5@vtk.be", emails: ["g5@vtk.be.lid"] },
        { id: "lustrum", email: "lustrum@vtk.be", emails: ["oud@vtk.be"] },
      ],
      people,
      YEARS,
    );
    expect(result.get("a")?.statuses).toEqual([
      { kind: "group", active: true },
      { kind: "group", active: false },
      { kind: "unknown" },
    ]);
    expect(result.get("a")?.activity).toEqual({ total: 3, active: 1, lastYear: null });
    expect(result.get("lustrum")?.activity).toEqual({ total: 1, active: 0, lastYear: 2019 });
  });
});
