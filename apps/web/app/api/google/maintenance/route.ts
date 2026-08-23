import { reconcileMailGroups } from "@/lib/google/sync";

export const runtime = "nodejs";

function secret(): string | null {
  return process.env.GOOGLE_MAINTENANCE_SECRET?.trim() || null;
}

/**
 * Wordt elke vijf minuten aangeroepen door de `google-worker` uit
 * `infra/docker-compose.yml`: de groepsadressen in Google Workspace gelijk
 * zetten met de posten van dit werkingsjaar.
 *
 * Geeft 503 zodra er iets blijft haperen, zodat de healthcheck van de worker het
 * merkt in plaats van stil te blijven draaien. `unlinked` telt daar niet in mee:
 * dat zijn leden zonder gekoppeld @vtk.be-adres, en daar wacht de sync terecht
 * op tot iemand ze koppelt.
 */
export async function POST(request: Request) {
  const configured = secret();
  if (!configured || request.headers.get("authorization") !== `Bearer ${configured}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await reconcileMailGroups();
  if ("skipped" in result) {
    // Niet ingesteld is geen fout: de koppeling is optioneel, net als de kluis.
    return Response.json({ skipped: true }, { status: 200 });
  }
  return Response.json(result, { status: result.failed > 0 ? 503 : 200 });
}
