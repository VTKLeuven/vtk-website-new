import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { orderAccessCookieName, orderAccessCookieOptions } from "@/lib/ticketing/access";
import { secureTokenHash, verifyOrderAccessToken } from "@/lib/ticketing/crypto";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/ticketing/http";

const schema = z.object({ access: z.string().min(32).max(1_000) });

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const { access } = schema.parse(await readLimitedJson(request, 4 * 1024));
    const order = await prisma.ticketOrder.findUnique({
      where: { id: orderId },
      select: { id: true, accessTokenHash: true, accessExpiresAt: true },
    });
    if (
      !order ||
      order.accessExpiresAt <= new Date() ||
      secureTokenHash(access) !== order.accessTokenHash ||
      verifyOrderAccessToken(access, order.id) !== order.id
    ) {
      return Response.json({ error: "ACCESS_NOT_FOUND" }, { status: 404 });
    }

    const response = NextResponse.json({ exchanged: true });
    response.cookies.set(
      orderAccessCookieName(order.id),
      access,
      orderAccessCookieOptions(order.accessExpiresAt)
    );
    return response;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    return Response.json({ error: "ACCESS_EXCHANGE_FAILED" }, { status: 500 });
  }
}
