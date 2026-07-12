import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";

function retryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const databaseCode = (error.meta as { code?: unknown } | undefined)?.code;
  return databaseCode === "40001" || databaseCode === "40P01";
}

export async function withSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      lastError = error;
      if (!retryableTransactionError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 25 * 2 ** (attempt - 1) + Math.random() * 40)
      );
    }
  }
  throw lastError;
}
