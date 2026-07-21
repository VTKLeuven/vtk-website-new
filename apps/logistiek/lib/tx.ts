import 'server-only';

import { prisma } from '@vtk/db';
import { Prisma } from '@prisma/client';

const MAX_ATTEMPTS = 3;

/**
 * Voert een Serializable-transactie uit met automatische retry bij een
 * serialisatieconflict. Twee gelijktijdige beheeracties die dezelfde rijen
 * raken (bv. twee goedkeuringen die om dezelfde laatste stuks vechten) laten
 * Postgres er soms één afbreken met code 40001 (of een deadlock, 40P01); Prisma
 * meldt dat als P2034. Zonder retry belandt die gebruiker in de error boundary,
 * terwijl gewoon opnieuw proberen volstaat. Niet-retryable fouten (een echte
 * validatie- of voorraadfout die de callback zelf teruggeeft, of een andere
 * databasefout) gooien we meteen door.
 */
export async function runSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isSerializationConflict(err)) {
        // Korte, oplopende backoff met wat jitter zodat de twee botsende
        // transacties niet meteen opnieuw synchroon botsen.
        await sleep(15 * attempt + Math.random() * 15);
        continue;
      }
      throw err;
    }
  }
}

export function isSerializationConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: "Transaction failed due to a write conflict or a deadlock."
    return err.code === 'P2034';
  }
  // Soms bubbelt de rauwe Postgres-code door een unknown error heen.
  const message = err instanceof Error ? err.message : '';
  return /40001|40P01|could not serialize|deadlock detected/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
