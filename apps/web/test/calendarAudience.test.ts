import { describe, expect, it } from "vitest";
import { audienceFilter, audiencesForStudyProfile } from "@/lib/calendar/audience";

describe("calendar audiences", () => {
  it("derives LAST_YEARS for a final-master-year student", () => {
    expect(audiencesForStudyProfile(["MASTER_2"], false)).toEqual(["LAST_YEARS"]);
  });

  it("keeps all applicable audiences for a final-year international student", () => {
    expect(audiencesForStudyProfile(["MASTER_2"], true)).toEqual([
      "INTERNATIONALS",
      "LAST_YEARS",
    ]);
  });

  it("preserves the any-matching-audience filter semantics", () => {
    expect(audienceFilter(["LAST_YEARS"])).toEqual({
      OR: [
        { categories: { none: { category: { audience: { not: null } } } } },
        {
          categories: {
            some: { category: { audience: { in: ["LAST_YEARS"] } } },
          },
        },
      ],
    });
  });
});
