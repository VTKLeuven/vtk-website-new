import { cookies, headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { secureTokenHash, verifyOrderAccessToken } from "@/lib/ticketing/crypto";
import { orderAccessCookieName } from "@/lib/ticketing/access";
import { generateTicketsPdf } from "@/lib/ticketing/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const [session, cookieStore] = await Promise.all([getSession(await headers()), cookies()]);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: true,
      orderItem: { include: { order: true } },
    },
  });
  if (!ticket) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const order = ticket.orderItem.order;
  const access = cookieStore.get(orderAccessCookieName(order.id))?.value;
  const tokenValid = Boolean(
    access &&
      order.accessExpiresAt > new Date() &&
      secureTokenHash(access) === order.accessTokenHash &&
      verifyOrderAccessToken(access, order.id)
  );
  const owner = session?.user.id === order.buyerUserId || session?.user.isSuperAdmin;
  if (!tokenValid && !owner) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const locale = order.locale === "EN" ? "en-GB" : "nl-BE";
  const pdf = await generateTicketsPdf({
    orderNumber: order.reference,
    currency: order.currency,
    event: {
      title: order.locale === "EN" && ticket.event.titleEn ? ticket.event.titleEn : ticket.event.titleNl,
      startsAt: ticket.event.startsAt,
      location: ticket.event.location,
    },
    tickets: [
      {
        publicId: ticket.publicCode,
        qrVersion: ticket.credentialVersion,
        attendeeName: ticket.orderItem.attendeeName,
        typeName: ticket.orderItem.ticketTypeName,
        unitPriceCents: ticket.orderItem.totalCents,
      },
    ],
  });
  const filename = `${ticket.event.slug}-${ticket.publicCode}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Language": locale,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
