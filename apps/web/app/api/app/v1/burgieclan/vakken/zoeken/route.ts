import { corsPreflight } from "@/lib/cors";
import { searchCoursesRoute } from "@/lib/burgieclan/courses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vakken zoeken op naam of code (`?q=`, minstens twee tekens). */
export function GET(request: Request) {
  return searchCoursesRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
