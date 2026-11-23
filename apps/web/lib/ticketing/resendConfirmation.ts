import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { withOrderLock } from "./transactions";
import {
  RESEND_COOLDOWN_MS,
  resendDecision,
  type ResendDecision,
} from "./resendDecision";

export { RESEND_COOLDOWN_MS };

/**
 * Zet de bevestigingsmail van een bestelling opnieuw klaar, hoogstens één keer
 * tegelijk. In november 2026 kreeg een koper 132 keer en een andere 46 keer
 * dezelfde mail: de knop gaf geen teken van leven, de mail stond achter de
 * vorige in de rij, en elke klik maakte een nieuwe outbox-rij met een
 * willekeurige sleutel.
 *
 * De beslissing staat in `resendDecision`; hier enkel de lock en het schrijven.
 * De rij van de bestelling wordt vergrendeld, zodat twee snelle klikken (of
 * twee beheerders) niet allebei "er staat niets klaar" zien.
 */
export async function queueConfirmationResend(input: {
  eventId: string;
  orderId: string;
  recipient: string;
  actorUserId: string;
  now?: Date;
}): Promise<ResendDecision> {
  const now = input.now ?? new Date();
  return withOrderLock(input.orderId, async (tx) => {
    const messages = await tx.ticketOutboxMessage.findMany({
      where: { orderId: input.orderId, type: "ORDER_CONFIRMATION" },
      select: { id: true, status: true, sentAt: true, availableAt: true },
    });
    const decision = resendDecision(messages, now);

    if (decision.kind === "retry") {
      // Een mislukte poging zou pas na haar wachttijd opnieuw proberen; nu
      // meteen, in plaats van er een tweede naast te zetten die later ook
      // vertrekt.
      await tx.ticketOutboxMessage.update({
        where: { id: decision.messageId },
        data: { status: "PENDING", availableAt: now, lastError: null },
      });
      await auditQueued(tx, input);
    } else if (decision.kind === "queue") {
      await tx.ticketOutboxMessage.create({
        data: {
          eventId: input.eventId,
          orderId: input.orderId,
          type: "ORDER_CONFIRMATION",
          dedupeKey: `order-confirmation:${input.orderId}:manual:${randomBytes(10).toString("hex")}`,
          recipient: input.recipient,
          payload: { orderId: input.orderId, requestedById: input.actorUserId },
        },
      });
      await auditQueued(tx, input);
    }
    return decision;
  });
}

async function auditQueued(
  tx: Prisma.TransactionClient,
  input: { eventId: string; orderId: string; actorUserId: string },
) {
  await tx.ticketAuditLog.create({
    data: {
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      action: "ORDER_CONFIRMATION_QUEUED",
      entityType: "TicketOrder",
      entityId: input.orderId,
    },
  });
}
