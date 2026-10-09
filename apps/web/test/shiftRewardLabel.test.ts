import { describe, expect, it } from "vitest";
import { getDictionary } from "@vtk/i18n";
import { viewerRewardLabel } from "@/components/shift/shiftData";
import type { ShiftResponse } from "@/lib/shift";

/**
 * Een praesidiumlid verdient geen bonnetjes met zijn shiften, maar /shift zegt
 * wat de shift waard is en waarom hij ze niet krijgt, in plaats van
 * "0 bonnetjes". Zie "Praesidium verdient geen bonnetjes" in
 * docs/design-decisions.md.
 */

const t = getDictionary("nl").shift;

function shift(reward: number, withheldReward?: number): ShiftResponse {
  return { reward, withheldReward } as ShiftResponse;
}

describe("viewerRewardLabel", () => {
  it("toont gewoon wat je verdient", () => {
    expect(viewerRewardLabel(shift(2, 0), t)).toBe("2 bonnetjes");
    expect(viewerRewardLabel(shift(1), t)).toBe("1 bonnetje");
  });

  it("zegt wat de shift waard is wanneer je als praesidiumlid niets krijgt", () => {
    expect(viewerRewardLabel(shift(0, 2), t)).toBe(
      "2 bonnetjes, maar als praesidiumlid verdien je er geen",
    );
  });

  it("blijft op nul voor een shift zonder beloning", () => {
    expect(viewerRewardLabel(shift(0, 0), t)).toBe("0 bonnetjes");
  });
});
