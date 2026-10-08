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

/**
 * Een fout die enkel zegt dat het druk was: een conflict dat ook na de
 * herpogingen bleef, of geen vrije databaseverbinding binnen de wachttijd.
 * Aan de bestelling zelf is dan niets mis; meteen opnieuw proberen kan lukken.
 */
export function isTransientDatabaseError(error: unknown): boolean {
  if (retryableTransactionError(error)) return true;
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028";
}

/**
 * Hoe lang een transactie mag wachten op een verbinding en hoe lang ze mag
 * lopen. Prisma staat standaard op 2 en 5 seconden; bij de opening van een
 * cantus staan er honderden kopers tegelijk in de rij voor dertig verbindingen,
 * en dan is twee seconden wachten geen fout maar gewoon de rij.
 */
const BUSY_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

async function withRetries<T>(
  run: () => Promise<T>,
  maxAttempts: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
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

export async function withSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  return withRetries(
    () => prisma.$transaction(operation, { isolationLevel: "Serializable" }),
    maxAttempts
  );
}

/**
 * Een transactie die plaatsen reserveert, zonder SERIALIZABLE.
 *
 * Elke checkout van een event verhoogt dezelfde rij: de teller van de pot.
 * Onder SERIALIZABLE mag maar één van twee gelijktijdige kopers die rij
 * wijzigen; de andere krijgt "could not serialize access due to concurrent
 * update" en begint opnieuw. Bij de opening van de Eersteplaatscantus (8
 * oktober 2026) liep zo ~85% van de checkouts vast terwijl er nog plaatsen
 * waren.
 *
 * Onder READ COMMITTED wacht de tweede koper op de eerste en toetst Postgres de
 * WHERE van `reserveInventory` opnieuw tegen de nieuwe stand van de rij. Die
 * ene UPDATE is dus zelf het slot tegen overboeking, en daar is geen strengere
 * isolatie voor nodig. Wat er verder in een checkout gelezen wordt (open
 * reservaties, het erelidticket, gratis tickets per koper), staat achter een
 * advisory lock per koper: wie dat slot krijgt, ziet in READ COMMITTED wat de
 * vorige houder al bewaarde.
 */
export async function withReservationTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  return withRetries(
    () =>
      prisma.$transaction(operation, {
        isolationLevel: "ReadCommitted",
        ...BUSY_TRANSACTION_OPTIONS,
      }),
    maxAttempts
  );
}

/**
 * Een transactie die de toestand van één bestelling verandert (betaald,
 * vervallen, mislukt), met die bestelling op slot.
 *
 * Al die overgangen lezen eerst de status en beslissen dan wat ze schrijven.
 * Het slot op de rij (`FOR UPDATE`, als allereerste stap) zorgt dat twee
 * overgangen van dezelfde bestelling nooit door elkaar lopen: de tweede wacht
 * tot de eerste klaar is en leest daarna de nieuwe status. Dat is dezelfde
 * garantie als SERIALIZABLE voor deze bestelling, zonder dat een betaling
 * afketst omdat een checkout van iemand anders intussen de pot wijzigde. Dat
 * gebeurde wél: tijdens een rush faalden zo betalingsbevestigingen, en een
 * annulering die daardoor seconden uitliep, liet iemand betalen voor een
 * bestelling die intussen vervallen was.
 */
export async function withOrderLock<T>(
  orderId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  return withRetries(
    () =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM "TicketOrder" WHERE "id" = ${orderId} FOR UPDATE`;
          return operation(tx);
        },
        { isolationLevel: "ReadCommitted", ...BUSY_TRANSACTION_OPTIONS }
      ),
    maxAttempts
  );
}
