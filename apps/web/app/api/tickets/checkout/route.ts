import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { orderAccessCookieName, orderAccessCookieOptions } from "@/lib/ticketing/access";
import { createRequestFingerprint } from "@/lib/ticketing/crypto";
import {
  readLimitedJson,
  RequestBodyTooLargeError,
  trustedClientIp,
} from "@/lib/ticketing/http";
import { createTicketCheckout, TicketCheckoutError } from "@/lib/ticketing/orders";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readLimitedJson(request, 256 * 1024);
    const fingerprint = createRequestFingerprint(trustedClientIp(request));
    const checkout = await createTicketCheckout(input, fingerprint);
    const response = NextResponse.json(
      {
        orderId: checkout.orderId,
        orderNumber: checkout.orderNumber,
        checkoutUrl: checkout.checkoutUrl,
      },
      { status: 201 }
    );
    response.cookies.set(
      orderAccessCookieName(checkout.orderId),
      checkout.access,
      orderAccessCookieOptions(checkout.accessExpiresAt)
    );
    return response;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "UNSUPPORTED_MEDIA_TYPE") {
      return Response.json({ error: error.message }, { status: 415 });
    }
    if (error instanceof ZodError) {
      return Response.json(
        { error: "INVALID_REQUEST", fields: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    if (error instanceof TicketCheckoutError) {
      const status = error.code === "TOO_MANY_RESERVATIONS"
        ? 429
        : error.code === "SOLD_OUT" || error.code === "FREE_TICKET_LIMIT"
          ? 409
          : 400;
      return Response.json({ error: error.code, field: error.field }, { status });
    }
    console.error("Ticket checkout failed", error);
    return Response.json({ error: "CHECKOUT_FAILED" }, { status: 500 });
  }
}
