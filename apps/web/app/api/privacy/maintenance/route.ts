import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPrivacyRetention } from "@/lib/privacy/retention";

function authorized(request: Request): boolean {
  const secret = process.env.PRIVACY_MAINTENANCE_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!process.env.PRIVACY_MAINTENANCE_SECRET) {
    return NextResponse.json(
      { error: "PRIVACY_MAINTENANCE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return NextResponse.json(await runPrivacyRetention(), {
    headers: { "Cache-Control": "no-store" },
  });
}
