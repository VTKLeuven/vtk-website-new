import { getOrderForViewer } from "@/lib/ticketing/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const order = await getOrderForViewer(orderId);
  if (!order) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  return Response.json(order, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
