import { authErrorResponse } from "@/lib/session";
import { requireExpenseAccess } from "@/lib/rekeningen/server";
import { handleReceiptUpload } from "@/lib/rekeningen/receiptUpload";

export const runtime = "nodejs";

/**
 * Upload van één bonnetje bij een rekening. Wat er met het bestand gebeurt
 * (eigen prefix, EXIF weg), staat in `lib/rekeningen/receiptUpload.ts`.
 */
export async function POST(request: Request) {
  try {
    await requireExpenseAccess();
  } catch (error) {
    return authErrorResponse(error);
  }
  return handleReceiptUpload(request);
}
