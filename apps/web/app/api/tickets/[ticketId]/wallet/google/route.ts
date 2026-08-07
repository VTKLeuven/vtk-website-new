import { resolveAuthorizedTicket } from "@/lib/ticketing/ticketAccess";
import { getGoogleWalletSaveUrl, isGoogleWalletAvailable } from "@/lib/ticketing/wallet";
import { walletInputFromTicket } from "@/lib/ticketing/wallet/fromTicket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  if (!isGoogleWalletAvailable()) return Response.json({ error: "NOT_CONFIGURED" }, { status: 404 });
  const { ticketId } = await params;
  const resolved = await resolveAuthorizedTicket(ticketId);
  if (!resolved) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const saveUrl = await getGoogleWalletSaveUrl(walletInputFromTicket(resolved.ticket));
  return Response.redirect(saveUrl, 302);
}
