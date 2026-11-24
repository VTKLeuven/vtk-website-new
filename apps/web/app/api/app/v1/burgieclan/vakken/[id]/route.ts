import { corsPreflight } from "@/lib/cors";
import { courseDetailRoute } from "@/lib/burgieclan/courses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Eén vak met zijn documenten, `AppBurgieclanCourseDetail`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return courseDetailRoute(request, (await params).id);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
