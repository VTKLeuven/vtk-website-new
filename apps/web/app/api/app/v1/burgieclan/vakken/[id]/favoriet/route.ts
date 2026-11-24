import { corsPreflight } from "@/lib/cors";
import { favouriteRoute } from "@/lib/burgieclan/courses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een vak bij je vakken zetten (`PUT`) of eruit halen (`DELETE`). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return favouriteRoute(request, (await params).id, true);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return favouriteRoute(request, (await params).id, false);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "PUT, DELETE, OPTIONS");
}
