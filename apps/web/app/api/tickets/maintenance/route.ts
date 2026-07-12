import { prisma } from "@vtk/db";
import { maintenanceSecret } from "@/lib/ticketing/config";
import { releaseExpiredOrders } from "@/lib/ticketing/orders";
import { processTicketOutbox } from "@/lib/ticketing/outbox";
import { reconcileTicketPayments } from "@/lib/ticketing/reconciliation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = maintenanceSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const reconciliation = await reconcileTicketPayments(50);
  const expired = await releaseExpiredOrders(100);
  const outbox = await processTicketOutbox(20);
  const deadOutbox = await prisma.ticketOutboxMessage.count({ where: { status: "DEAD" } });
  const unhealthy = reconciliation.failed > 0 || outbox.failed > 0 || deadOutbox > 0;
  return Response.json(
    { reconciliation, expired, outbox, deadOutbox },
    { status: unhealthy ? 503 : 200 }
  );
}
