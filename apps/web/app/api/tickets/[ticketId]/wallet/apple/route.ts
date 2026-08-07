import { resolveAuthorizedTicket } from "@/lib/ticketing/ticketAccess";
import { getAppleWalletPass, isAppleWalletAvailable } from "@/lib/ticketing/wallet";
import { walletInputFromTicket } from "@/lib/ticketing/wallet/fromTicket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  if (!isAppleWalletAvailable()) return Response.json({ error: "NOT_CONFIGURED" }, { status: 404 });
  const { ticketId } = await params;
  const resolved = await resolveAuthorizedTicket(ticketId);
  if (!resolved) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const pass = await getAppleWalletPass(walletInputFromTicket(resolved.ticket));
  const filename = `${resolved.ticket.event.slug}-${resolved.ticket.publicCode}.pkpass`.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(Buffer.from(pass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
