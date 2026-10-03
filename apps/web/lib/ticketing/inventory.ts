import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Waarom een reservatie niet lukte. `SOLD_OUT` is de pot zelf; de andere twee
 * zijn het plafond voor leden of niet-leden binnen een pot die verder nog
 * plaats heeft (zie `lib/ticketing/seats.ts`).
 */
export type TicketInventoryShortage = "POOL" | "MEMBER_SEATS" | "NON_MEMBER_SEATS";

export class TicketInventoryError extends Error {
  constructor(
    public readonly code: "SOLD_OUT" | "INVENTORY_CORRUPT",
    public readonly poolId: string,
    public readonly shortage: TicketInventoryShortage = "POOL"
  ) {
    super(code);
    this.name = "TicketInventoryError";
  }
}

/** Per pot: hoeveel plaatsen in totaal, en hoeveel daarvan ledenplaatsen. */
type PoolQuantities = Map<string, { total: number; member: number }>;

function sortedQuantities(quantities: PoolQuantities) {
  return [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function quantitiesByPool(
  items: Array<{ inventoryPoolId: string; memberSeat?: boolean }>
): PoolQuantities {
  const quantities: PoolQuantities = new Map();
  for (const item of items) {
    const current = quantities.get(item.inventoryPoolId) ?? { total: 0, member: 0 };
    quantities.set(item.inventoryPoolId, {
      total: current.total + 1,
      member: current.member + (item.memberSeat ? 1 : 0),
    });
  }
  return quantities;
}

/**
 * Reserveert plaatsen, pot per pot, in één UPDATE met de controle erin: geen
 * lezen-en-dan-schrijven, dus twee gelijktijdige bestellingen kunnen samen nooit
 * over de capaciteit of over een plafond gaan.
 *
 * Een plafond houdt enkel tegen wat eronder valt: staat het ledenplafond al vol
 * (bv. omdat een beheerder het verlaagde), dan kan een niet-lid nog gewoon
 * kopen.
 */
export async function reserveInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, { total, member }] of sortedQuantities(quantities)) {
    const nonMember = total - member;
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "reservedCount" = "reservedCount" + ${total},
        "memberReservedCount" = "memberReservedCount" + ${member},
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "active" = TRUE
        AND "reservedCount" + "soldCount" + ${total} <= "capacity"
        AND (
          "memberCapacity" IS NULL
          OR ${member}::integer = 0
          OR "memberReservedCount" + "memberSoldCount" + ${member} <= "memberCapacity"
        )
        AND (
          "nonMemberCapacity" IS NULL
          OR ${nonMember}::integer = 0
          OR "reservedCount" + "soldCount" - "memberReservedCount" - "memberSoldCount" + ${nonMember}
            <= "nonMemberCapacity"
        )
    `;
    if (changed !== 1) {
      throw new TicketInventoryError("SOLD_OUT", poolId, await shortageOf(tx, poolId, total, member));
    }
  }
}

/**
 * Wat er net tekortschoot, om de koper te kunnen zeggen of het event vol zit of
 * enkel de plaatsen voor zijn soort. Enkel een melding: de UPDATE hierboven
 * heeft al beslist.
 */
async function shortageOf(
  tx: Prisma.TransactionClient,
  poolId: string,
  total: number,
  member: number
): Promise<TicketInventoryShortage> {
  const pool = await tx.ticketInventoryPool.findUnique({ where: { id: poolId } });
  if (!pool || !pool.active) return "POOL";
  const taken = pool.reservedCount + pool.soldCount;
  if (taken + total > pool.capacity) return "POOL";
  const memberTaken = pool.memberReservedCount + pool.memberSoldCount;
  if (member > 0 && pool.memberCapacity != null && memberTaken + member > pool.memberCapacity) {
    return "MEMBER_SEATS";
  }
  return total - member > 0 && pool.nonMemberCapacity != null ? "NON_MEMBER_SEATS" : "POOL";
}

export async function releaseReservedInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, { total, member }] of sortedQuantities(quantities)) {
    // De ledenteller begrensd op nul en niet bewaakt zoals het totaal: een
    // afwijking daar mag nooit verhinderen dat een vervallen bestelling haar
    // plaatsen teruggeeft.
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "reservedCount" = "reservedCount" - ${total},
        "memberReservedCount" = GREATEST(0, "memberReservedCount" - ${member}),
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "reservedCount" >= ${total}
    `;
    if (changed !== 1) throw new TicketInventoryError("INVENTORY_CORRUPT", poolId);
  }
}

export async function commitReservedInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, { total, member }] of sortedQuantities(quantities)) {
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "reservedCount" = "reservedCount" - ${total},
        "soldCount" = "soldCount" + ${total},
        "memberReservedCount" = GREATEST(0, "memberReservedCount" - ${member}),
        "memberSoldCount" = "memberSoldCount" + ${member},
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "reservedCount" >= ${total}
    `;
    if (changed !== 1) throw new TicketInventoryError("INVENTORY_CORRUPT", poolId);
  }
}

export async function returnSoldInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, { total, member }] of sortedQuantities(quantities)) {
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "soldCount" = "soldCount" - ${total},
        "memberSoldCount" = GREATEST(0, "memberSoldCount" - ${member}),
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "soldCount" >= ${total}
    `;
    if (changed !== 1) throw new TicketInventoryError("INVENTORY_CORRUPT", poolId);
  }
}
