import { NextResponse } from "next/server";
import { exportUserData } from "@/lib/privacy/account";
import { authErrorResponse, requireSession } from "@/lib/session";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    return authErrorResponse(error);
  }

  const data = await exportUserData(session.user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vtk-personal-data-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
