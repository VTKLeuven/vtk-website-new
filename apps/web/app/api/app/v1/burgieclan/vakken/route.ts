import { corsPreflight } from "@/lib/cors";
import { favouriteCoursesRoute } from "@/lib/burgieclan/courses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Je vakken op Burgieclan (dezelfde lijst als "Mijn vakken" daar), `AppBurgieclanCourses`. */
export function GET(request: Request) {
  return favouriteCoursesRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
