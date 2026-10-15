import { reconcileGoogle } from "@/lib/google/sync";
import { scanBestuursorgaanIfDue } from "@/lib/bo/scan";

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
 * op tot iemand ze koppelt. `accountWarnings` evenmin: een doorstuuradres dat op
 * zijn bevestigingsmail wacht, is geen storing.
 *
 * Dezelfde ronde leest om het halfuur de BO-map (`lib/bo/scan.ts`). Die telt
 * niet mee in de statuscode: een BO-map die niet te lezen is, staat als melding
 * op /admin/bestuursorgaan, bij wie er iets aan kan doen, en mag de sync van de
 * groepsadressen niet als gestoord laten doorgaan.
 */
export async function POST(request: Request) {
  const configured = secret();
  if (!configured || request.headers.get("authorization") !== `Bearer ${configured}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await reconcileGoogle();
  const bestuursorgaan = await scanBestuursorgaanIfDue().then(
    (outcome) => ("skipped" in outcome ? { skipped: outcome.skipped } : { error: outcome.status.error }),
    (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }),
  );
  if ("skipped" in result) {
    // Niet ingesteld is geen fout: de koppeling is optioneel, net als de kluis.
    return Response.json({ skipped: true, bestuursorgaan }, { status: 200 });
  }
  return Response.json({ ...result, bestuursorgaan }, { status: result.failed > 0 ? 503 : 200 });
}
