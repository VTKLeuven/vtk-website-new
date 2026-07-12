import "server-only";

import type { Prisma } from "@prisma/client";

export class TicketInventoryError extends Error {
  constructor(
    public readonly code: "SOLD_OUT" | "INVENTORY_CORRUPT",
    public readonly poolId: string
  ) {
    super(code);
    this.name = "TicketInventoryError";
  }
}

type PoolQuantities = Map<string, number>;

function sortedQuantities(quantities: PoolQuantities): Array<[string, number]> {
  return [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function quantitiesByPool(items: Array<{ inventoryPoolId: string }>): PoolQuantities {
  const quantities: PoolQuantities = new Map();
  for (const item of items) {
    quantities.set(item.inventoryPoolId, (quantities.get(item.inventoryPoolId) ?? 0) + 1);
  }
  return quantities;
}

export async function reserveInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, quantity] of sortedQuantities(quantities)) {
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "reservedCount" = "reservedCount" + ${quantity},
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "active" = TRUE
        AND "reservedCount" + "soldCount" + ${quantity} <= "capacity"
    `;
    if (changed !== 1) throw new TicketInventoryError("SOLD_OUT", poolId);
  }
}

export async function releaseReservedInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, quantity] of sortedQuantities(quantities)) {
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "reservedCount" = "reservedCount" - ${quantity},
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "reservedCount" >= ${quantity}
    `;
    if (changed !== 1) throw new TicketInventoryError("INVENTORY_CORRUPT", poolId);
  }
}

export async function commitReservedInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, quantity] of sortedQuantities(quantities)) {
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "reservedCount" = "reservedCount" - ${quantity},
        "soldCount" = "soldCount" + ${quantity},
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "reservedCount" >= ${quantity}
    `;
    if (changed !== 1) throw new TicketInventoryError("INVENTORY_CORRUPT", poolId);
  }
}

export async function returnSoldInventory(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantities: PoolQuantities
) {
  for (const [poolId, quantity] of sortedQuantities(quantities)) {
    const changed = await tx.$executeRaw`
      UPDATE "TicketInventoryPool"
      SET
        "soldCount" = "soldCount" - ${quantity},
        "version" = "version" + 1,
        "updatedAt" = NOW()
      WHERE "id" = ${poolId}
        AND "eventId" = ${eventId}
        AND "soldCount" >= ${quantity}
    `;
    if (changed !== 1) throw new TicketInventoryError("INVENTORY_CORRUPT", poolId);
  }
}
