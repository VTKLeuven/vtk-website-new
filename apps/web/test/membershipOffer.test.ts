import { describe, expect, it } from "vitest";

import { DEFAULT_MEMBERSHIP_CONFIG } from "@/lib/membership/config";
import { membershipOffer } from "@/lib/membership/offer";

describe("ereleden en het lidmaatschap", () => {
  it("een erelid krijgt geen aanbod om lid te worden: hij is het al", () => {
    const config = { ...DEFAULT_MEMBERSHIP_CONFIG, externalOpen: true };
    expect(membershipOffer({ firwStudent: false, honoraryMember: true }, null, config)).toEqual({
      kind: "none",
      reason: "already",
    });
    expect(membershipOffer({ firwStudent: false, honoraryMember: false }, null, config).kind).toBe("external");
  });
});
