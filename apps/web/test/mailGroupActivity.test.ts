import { describe, expect, it } from "vitest";
import {
  type ActivityPerson,
  classifyGroups,
  groupActivity,
  namedForCurrentYear,
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
    ).toEqual({ total: 3, active: 0, unknown: 1, lastYear: 2023, thisYear: false });
  });
});

describe("namedForCurrentYear", () => {
  it("herkent dit en volgend werkingsjaar in het adres", () => {
    expect(namedForCurrentYear("sport_2627@vtk.be", 2026)).toBe(true);
    expect(namedForCurrentYear("activiteiten_2728@vtk.be", 2026)).toBe(true);
    expect(namedForCurrentYear("activiteiten_2526@vtk.be", 2026)).toBe(false);
    expect(namedForCurrentYear("room2627@vtk.be", 2026)).toBe(false);
  });
});

describe("classifyGroups", () => {
  it("een geneste groep telt over alle niveaus: 24urenloop > sport > sport_2627", () => {
    const people = new Map([["lid@vtk.be", person({ lastPostYear: 2026 })]]);
    const result = classifyGroups(
      [
        { id: "24", email: "24urenloop@vtk.be", emails: ["logistiek@vtk.be", "sport@vtk.be"] },
        { id: "sport", email: "sport@vtk.be", emails: ["sport_2627@vtk.be"] },
        { id: "s2627", email: "sport_2627@vtk.be", emails: ["lid@vtk.be"] },
        { id: "log", email: "logistiek@vtk.be", emails: ["x@gmail.com"] },
      ],
      people,
      YEARS,
    );
    expect(result.get("24")?.activity).toEqual({ total: 2, active: 1, unknown: 0, lastYear: null, thisYear: false });
    expect(result.get("24")?.statuses).toEqual([
      { kind: "group", active: false, thisYear: false, lastYear: null },
      { kind: "group", active: true, thisYear: false, lastYear: null },
    ]);
  });

  it("een groep van dit werkingsjaar is actief, ook zonder gekende leden", () => {
    const result = classifyGroups(
      [
        { id: "sport", email: "sport@vtk.be", emails: ["sport_2627@vtk.be"] },
        { id: "s2627", email: "sport_2627@vtk.be", emails: ["onbekend@vtk.be"] },
      ],
      new Map(),
      YEARS,
    );
    expect(result.get("sport")?.activity.active).toBe(1);
    expect(result.get("s2627")?.activity).toEqual({ total: 1, active: 0, unknown: 1, lastYear: null, thisYear: true });
  });

  it("een kring van groepen loopt niet vast en is niet actief", () => {
    const result = classifyGroups(
      [
        { id: "a", email: "a@vtk.be", emails: ["b@vtk.be"] },
        { id: "b", email: "b@vtk.be", emails: ["a@vtk.be"] },
      ],
      new Map(),
      YEARS,
    );
    expect(result.get("a")?.activity.active).toBe(0);
  });

  it("onthoudt het jongste jaar ook door een geneste groep heen", () => {
    const people = new Map([["oud@vtk.be", person({ lastPostYear: 2019 })]]);
    const result = classifyGroups(
      [
        { id: "top", email: "top@vtk.be", emails: ["lustrum@vtk.be"] },
        { id: "lustrum", email: "lustrum@vtk.be", emails: ["oud@vtk.be"] },
      ],
      people,
      YEARS,
    );
    expect(result.get("top")?.activity).toEqual({ total: 1, active: 0, unknown: 0, lastYear: 2019, thisYear: false });
  });
});
