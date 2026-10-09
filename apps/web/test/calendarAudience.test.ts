import { describe, expect, it } from "vitest";
import { audienceFilter, audiencesForStudyProfile } from "@/lib/calendar/audience";

const profile = {
  studyYears: [] as ("BACHELOR_1" | "MASTER_2")[],
  internationalStudent: false,
  alumni: false,
  sideEntrant: false,
};

describe("calendar audiences", () => {
  it("derives LAST_YEARS for a final-master-year student", () => {
    expect(audiencesForStudyProfile({ ...profile, studyYears: ["MASTER_2"] })).toEqual([
      "LAST_YEARS",
    ]);
  });

  it("keeps all applicable audiences for a final-year international student", () => {
    expect(
      audiencesForStudyProfile({ ...profile, studyYears: ["MASTER_2"], internationalStudent: true }),
    ).toEqual(["INTERNATIONALS", "LAST_YEARS"]);
  });

  it("uses the explicit alumni profile field", () => {
    expect(audiencesForStudyProfile({ ...profile, alumni: true })).toEqual(["ALUMNI"]);
  });

  it("uses the explicit side-entrant profile field", () => {
    expect(
      audiencesForStudyProfile({ ...profile, studyYears: ["MASTER_2"], sideEntrant: true }),
    ).toEqual(["LAST_YEARS", "SIDE_ENTRANTS"]);
  });

  it("preserves the any-matching-audience filter semantics", () => {
    expect(audienceFilter(["LAST_YEARS"])).toEqual({
      OR: [
        { categories: { none: { category: { audience: { not: null } } } } },
        {
          categories: {
            some: { category: { audience: { in: ["LAST_YEARS", "CUSTOM"] } } },
          },
        },
      ],
    });
  });

  it("never filters out an audience the profile cannot recognise", () => {
    // Een doelgroep zonder profielregel staat nergens in het profiel; wegfilteren
    // zou het event net verbergen voor wie het bedoeld is.
    expect(audienceFilter([])).toEqual({
      OR: [
        { categories: { none: { category: { audience: { not: null } } } } },
        { categories: { some: { category: { audience: { in: ["CUSTOM"] } } } } },
      ],
    });
  });

  it("never derives the custom audience from a profile", () => {
    expect(
      audiencesForStudyProfile({
        studyYears: ["BACHELOR_1", "MASTER_2"],
        internationalStudent: true,
        alumni: true,
        sideEntrant: true,
      }),
    ).not.toContain("CUSTOM");
  });
});
