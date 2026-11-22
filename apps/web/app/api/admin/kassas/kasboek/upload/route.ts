import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/session";
import { requireCashRegisterAccess } from "@/lib/kassas/server";
import { handleReceiptUpload } from "@/lib/rekeningen/receiptUpload";

export const runtime = "nodejs";

/**
 * Upload van de factuur bij een aankoop in het kasboek van Beheer. Zelfde
 * behandeling als een bonnetje bij een rekening (`lib/rekeningen/receiptUpload.ts`),
 * maar enkel voor wie de kassa's beheert.
 */
export async function POST(request: Request) {
  try {
    const access = await requireCashRegisterAccess();
    if (!access.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } catch (error) {
    return authErrorResponse(error);
  }
  return handleReceiptUpload(request);
}
