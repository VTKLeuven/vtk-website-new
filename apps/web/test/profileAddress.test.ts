import { describe, expect, it } from "vitest";
import {
  addressSchema,
  addressUpdate,
  hasCompleteAddresses,
  type StoredAddress,
} from "@/lib/profile-address";

const complete: StoredAddress = {
  noKot: false,
  street: "Tiensestraat",
  houseNumber: "12",
  bus: "3",
  postalCode: "3000",
  city: "Leuven",
  homeStreet: "Kerkstraat",
  homeHouseNumber: "4",
  homeBus: null,
  homePostalCode: "9000",
  homeCity: "Gent",
};

describe("profile addresses", () => {
  it("requires both a home and room address when the member has a room", () => {
    expect(hasCompleteAddresses(complete)).toBe(true);
    expect(hasCompleteAddresses({ ...complete, street: null })).toBe(false);
    expect(hasCompleteAddresses({ ...complete, homeStreet: null })).toBe(false);
  });

  it("allows an absent room address only with the explicit checkbox", () => {
    const withoutKot = {
      ...complete,
      noKot: true,
      street: null,
      houseNumber: null,
      bus: null,
      postalCode: null,
      city: null,
    };
    expect(hasCompleteAddresses(withoutKot)).toBe(true);
    expect(hasCompleteAddresses({ ...withoutKot, noKot: false })).toBe(false);
  });

  it("still requires every non-optional home field when there is no room", () => {
    const parsed = addressSchema.safeParse({
      noKot: true,
      homeStreet: "Kerkstraat",
      homeHouseNumber: "",
      homePostalCode: "9000",
      homeCity: "Gent",
    });
    expect(parsed.success).toBe(false);
  });

  it("clears stale room fields when no room is selected", () => {
    const parsed = addressSchema.parse({
      ...complete,
      noKot: true,
      homeBus: "",
      street: "oud",
      houseNumber: "1",
      postalCode: "3000",
      city: "Leuven",
    });
    expect(addressUpdate(parsed)).toMatchObject({
      noKot: true,
      street: null,
      houseNumber: null,
      bus: null,
      postalCode: null,
      city: null,
      homeStreet: "Kerkstraat",
    });
  });
});
