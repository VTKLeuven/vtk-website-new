/**
 * Plaatsen voor leden en niet-leden binnen één pot (`TicketInventoryPool`).
 *
 * Een pot heeft een capaciteit en optioneel een plafond voor leden
 * (`memberCapacity`) en een voor niet-leden (`nonMemberCapacity`). "80 leden en
 * 20 niet-leden" zet beide; "hoogstens 20 niet-leden, de rest mag naar leden"
 * zet enkel het tweede. Zie docs/design-decisions.md, "Plaatsen: potten met een
 * plafond voor leden".
 *
 * Puur en zonder Prisma: de checkout gebruikt dit om een plaats in te delen, de
 * queries om de shop te vertellen hoeveel er voor deze bezoeker nog over is, en
 * het beheer om de stand te tonen.
 */

export type SeatKind = "MEMBER" | "NON_MEMBER";

/**
 * Telt een ticket als ledenplaats?
 *
 * Ja wanneer een lid het koopt, behalve aan de gewone prijs van een soort met
 * ledenprijs: daar kiest het lid bewust de prijs voor een niet-lid (een vriend
 * die meegaat). Een ticket aan de ledenprijs is altijd een ledenplaats, want
 * enkel een lid krijgt die prijs.
 *
 * Bij een soort zonder ledenprijs weten we van de deelnemers niets meer dan van
 * de koper; elk ticket dat een lid daar koopt, telt dus als lid.
 */
export function isMemberSeat({
  buyerIsMember,
  memberPrice,
  typeHasMemberPrice,
}: {
  buyerIsMember: boolean;
  memberPrice: boolean;
  typeHasMemberPrice: boolean;
}): boolean {
  if (memberPrice) return true;
  if (!buyerIsMember) return false;
  return !typeHasMemberPrice;
}

export type PoolSeatCounts = {
  capacity: number;
  reservedCount: number;
  soldCount: number;
  memberCapacity: number | null;
  nonMemberCapacity: number | null;
  memberReservedCount: number;
  memberSoldCount: number;
};

export type PoolRemaining = {
  /** Plaatsen die nog vrij zijn in de pot, los van wie ze neemt. */
  total: number;
  /** Wat een lid er nog kan nemen: de pot, of minder door het ledenplafond. */
  member: number;
  /** Idem voor een niet-lid. */
  nonMember: number;
};

/** Hoeveel plaatsen er nog over zijn, voor leden en voor niet-leden. */
export function poolRemaining(pool: PoolSeatCounts): PoolRemaining {
  const taken = pool.reservedCount + pool.soldCount;
  const memberTaken = Math.min(taken, pool.memberReservedCount + pool.memberSoldCount);
  const nonMemberTaken = taken - memberTaken;
  const total = Math.max(0, pool.capacity - taken);
  return {
    total,
    member:
      pool.memberCapacity == null
        ? total
        : Math.min(total, Math.max(0, pool.memberCapacity - memberTaken)),
    nonMember:
      pool.nonMemberCapacity == null
        ? total
        : Math.min(total, Math.max(0, pool.nonMemberCapacity - nonMemberTaken)),
  };
}

/** De bezetting van een pot, voor het beheer: hoeveel leden en niet-leden er al in zitten. */
export function poolTaken(pool: PoolSeatCounts) {
  const total = pool.reservedCount + pool.soldCount;
  const member = Math.min(total, pool.memberReservedCount + pool.memberSoldCount);
  return { total, member, nonMember: total - member };
}

/**
 * Hoeveel plaatsen een pot met deze plafonds hoogstens kan verkopen. Zetten de
 * twee plafonds samen minder dan de capaciteit, dan blijft de rest leeg; het
 * beheer zegt dat erbij in plaats van het te weigeren.
 */
export function poolSellableCapacity(pool: {
  capacity: number;
  memberCapacity: number | null;
  nonMemberCapacity: number | null;
}): number {
  if (pool.memberCapacity == null || pool.nonMemberCapacity == null) return pool.capacity;
  return Math.min(pool.capacity, pool.memberCapacity + pool.nonMemberCapacity);
}
