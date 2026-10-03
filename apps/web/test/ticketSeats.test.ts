import { describe, expect, it } from "vitest";
import { isMemberSeat, poolRemaining, poolSellableCapacity } from "@/lib/ticketing/seats";

const pool = (overrides: Partial<Parameters<typeof poolRemaining>[0]> = {}) => ({
  capacity: 100,
  reservedCount: 0,
  soldCount: 0,
  memberCapacity: null,
  nonMemberCapacity: null,
  memberReservedCount: 0,
  memberSoldCount: 0,
  ...overrides,
});

describe("wat als ledenplaats telt", () => {
  it("is een ticket aan de ledenprijs altijd", () => {
    expect(isMemberSeat({ buyerIsMember: true, memberPrice: true, typeHasMemberPrice: true })).toBe(true);
  });

  it("is het gewone ticket van een soort met ledenprijs nooit, ook niet voor een lid", () => {
    expect(isMemberSeat({ buyerIsMember: true, memberPrice: false, typeHasMemberPrice: true })).toBe(false);
  });

  it("volgt bij een soort zonder ledenprijs de koper", () => {
    expect(isMemberSeat({ buyerIsMember: true, memberPrice: false, typeHasMemberPrice: false })).toBe(true);
    expect(isMemberSeat({ buyerIsMember: false, memberPrice: false, typeHasMemberPrice: false })).toBe(false);
  });
});

describe("wat er in een pot nog vrij is", () => {
  it("zonder plafond: voor iedereen wat de pot nog heeft", () => {
    expect(poolRemaining(pool({ soldCount: 30 }))).toEqual({ total: 70, member: 70, nonMember: 70 });
  });

  it("80 leden en 20 niet-leden", () => {
    const remaining = poolRemaining(
      pool({ memberCapacity: 80, nonMemberCapacity: 20, soldCount: 25, memberSoldCount: 10 })
    );
    // 10 leden en 15 niet-leden verkocht.
    expect(remaining).toEqual({ total: 75, member: 70, nonMember: 5 });
  });

  it("hoogstens 20 niet-leden, de rest mag naar leden", () => {
    const remaining = poolRemaining(pool({ nonMemberCapacity: 20, soldCount: 90, memberSoldCount: 70 }));
    expect(remaining).toEqual({ total: 10, member: 10, nonMember: 0 });
  });

  it("telt reservaties mee", () => {
    const remaining = poolRemaining(
      pool({ memberCapacity: 5, reservedCount: 3, memberReservedCount: 3, soldCount: 2, memberSoldCount: 2 })
    );
    expect(remaining.member).toBe(0);
  });

  it("zegt hoeveel er samen te verkopen zijn wanneer de plafonds niet optellen tot de pot", () => {
    expect(poolSellableCapacity({ capacity: 100, memberCapacity: 50, nonMemberCapacity: 20 })).toBe(70);
    expect(poolSellableCapacity({ capacity: 100, memberCapacity: 50, nonMemberCapacity: null })).toBe(100);
  });
});
