import { NextResponse } from "next/server";
import { getImmichFaceSearch, immichFaceSearchStatus } from "@/lib/immich-face-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await context.params;
    return NextResponse.json(getImmichFaceSearch(requestId));
  } catch (error) {
    const status = immichFaceSearchStatus(error);
    return NextResponse.json(
      {
        error: status.message,
        code: status.code,
      },
      { status: status.status },
    );
  }
}
