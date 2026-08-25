import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { setEventInterest } from "@/lib/app-api/interest";
import { appErrorResponse, appJson, appNotFound } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De ster op een evenement.
 *
 * `POST` zet ze aan, `DELETE` weer uit; allebei zonder body, want het id staat in
 * het pad en er valt verder niets te kiezen. Twee keer hetzelfde sturen is geen
 * fout: een tik op een ster die al aan stond, hoort niets te doen en zeker niet
 * te falen op een trage verbinding waar de eerste tik al aankwam.
 *
 * Uitzetten controleert bewust **niet** of het evenement nog zichtbaar is. Een
 * evenement kan intussen ingetrokken zijn of buiten je doelgroep vallen; dan moet
 * je je eigen ster nog altijd weg kunnen halen.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    await setEventInterest(session.user.id, id, true);
    return appJson(request, { interested: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return appNotFound(request, "Evenement niet gevonden.");
    }
    return appErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    await setEventInterest(session.user.id, id, false);
    return appJson(request, { interested: false });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, DELETE, OPTIONS");
}
