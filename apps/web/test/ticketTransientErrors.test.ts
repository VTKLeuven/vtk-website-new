import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));

const { isTransientDatabaseError } = await import("@/lib/ticketing/transactions");

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("test", { code, clientVersion: "test", meta });
}

describe("isTransientDatabaseError", () => {
  it("treats a full connection pool as busy, inside and outside a transaction", () => {
    // P2028: een transactie kreeg geen verbinding binnen `maxWait`.
    expect(isTransientDatabaseError(prismaError("P2028"))).toBe(true);
    // P2024: een gewone query (het event, de koper) wachtte te lang op de pool.
    expect(isTransientDatabaseError(prismaError("P2024"))).toBe(true);
  });

  it("treats a conflict that outlasted the retries as busy", () => {
    expect(isTransientDatabaseError(prismaError("P2034"))).toBe(true);
    expect(isTransientDatabaseError(prismaError("P2010", { code: "40001" }))).toBe(true);
    expect(isTransientDatabaseError(prismaError("P2010", { code: "40P01" }))).toBe(true);
  });

  it("leaves real failures alone", () => {
    expect(isTransientDatabaseError(prismaError("P2002"))).toBe(false);
    expect(isTransientDatabaseError(prismaError("P2010", { code: "23505" }))).toBe(false);
    expect(isTransientDatabaseError(new Error("P2024"))).toBe(false);
  });
});
