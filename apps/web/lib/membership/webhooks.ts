import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";

/**
 * De boekhouding rond één binnengekomen betaalmelding: opslaan, precies één
 * keer verwerken, en een mislukte verwerking herhaalbaar achterlaten.
 *
 * Bewust gedeeld door beide providers. Bij ticketing staat deze twintig regels
 * twee keer, en ze zijn ondertussen licht uit elkaar gegroeid; hier is het één
 * keer geschreven en dus één keer juist.
 *
 * Geen van beide providers stuurt een event-id mee, dus leidt de aanroeper een
 * stabiele sleutel af uit de waargenomen toestand: dezelfde overgang wordt één
 * keer verwerkt, een echte statuswijziging komt wel opnieuw langs.
 */
export async function handleMembershipWebhookEvent(input: {
  provider: string;
  externalEventId: string;
  payload: Prisma.InputJsonObject;
  process: () => Promise<void>;
}): Promise<Response> {
  const { provider, externalEventId } = input;

  let webhookId: string;
  let retried = false;
  try {
    const row = await prisma.membershipPaymentWebhook.create({
      data: { provider, externalEventId, signatureValid: true, payload: input.payload },
    });
    webhookId = row.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await prisma.membershipPaymentWebhook.findUnique({
      where: { provider_externalEventId: { provider, externalEventId } },
      select: { id: true, processedAt: true },
    });
    if (!existing) throw error;
    if (existing.processedAt) return Response.json({ received: true, duplicate: true });
    webhookId = existing.id;
    retried = true;
  }

  try {
    await input.process();
    await prisma.membershipPaymentWebhook.update({
      where: { id: webhookId },
      data: { processedAt: new Date(), processingAttempts: { increment: 1 }, lastError: null },
    });
    return Response.json({ received: true, retried });
  } catch (error) {
    await prisma.membershipPaymentWebhook.update({
      where: { id: webhookId },
      data: {
        processingAttempts: { increment: 1 },
        lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error",
      },
    });
    console.error("Membership webhook processing failed", { provider, externalEventId, error });
    return Response.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
