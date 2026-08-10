import "server-only";

import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";

type AuditClient = Pick<typeof prisma, "formAuditLog"> | Prisma.TransactionClient;

/**
 * Wie wijzigde welk formulier, wie verwijderde welke inzending.
 *
 * Schrijft binnen dezelfde transactie als de wijziging wanneer je er een
 * meegeeft; zo bestaat er geen wijziging zonder regel in de log. Een audit is
 * bewust nooit de reden dat een actie faalt, dus roep dit aan náást je mutatie
 * en niet als voorwaarde ervoor.
 */
export async function logFormAudit(
  client: AuditClient,
  entry: {
    formId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<void> {
  await client.formAuditLog.create({
    data: {
      formId: entry.formId,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
    },
  });
}
