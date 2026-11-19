import { corsPreflight } from "@/lib/cors";
import { readAppJson } from "@/lib/app-api/respond";
import { appPlanningOperationSchema } from "@/lib/app-api/schemas";
import { planningRoute } from "@/lib/burgieclan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén wijziging aan de planning (`AppPlanningOperation`): een les afvinken,
 * verbergen of verplicht zetten, een deadline afvinken, een VTK-evenement erin
 * zetten of eruit halen. Antwoordt met de hele planning.
 */
export async function POST(request: Request) {
  return planningRoute(request, async () => ({
    kind: "operation",
    operation: appPlanningOperationSchema.parse(await readAppJson(request)),
  }));
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
