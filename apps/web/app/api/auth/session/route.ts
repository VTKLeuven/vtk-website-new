import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Submodules call this to verify and resolve a session. The browser cookie is
// forwarded by the caller.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return NextResponse.json(session, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
