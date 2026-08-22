import { reconcileVault } from "@/lib/vault/sync";

export const runtime = "nodejs";

function secret(): string | null {
  return process.env.VAULT_MAINTENANCE_SECRET?.trim() || null;
}

/**
 * Wordt elke vijf minuten aangeroepen door de `vault-worker` uit
 * `infra/docker-compose.yml`: het lidmaatschap van de wachtwoordkluis gelijk
 * zetten met de posten van dit werkingsjaar.
 *
 * Geeft 503 zodra er iets blijft haperen, zodat de healthcheck van de worker het
 * merkt in plaats van stil te blijven draaien. `pending` telt daar niet in mee:
 * dat zijn leden die uitgenodigd zijn maar nog niet ingelogd, en daar wacht de
 * sync terecht op.
 */
export async function POST(request: Request) {
  const configured = secret();
  if (!configured || request.headers.get("authorization") !== `Bearer ${configured}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await reconcileVault();
  if ("skipped" in result) {
    // Niet ingesteld is geen fout: de koppeling is optioneel, net als Brevo.
    return Response.json({ skipped: true }, { status: 200 });
  }
  return Response.json(result, { status: result.failed > 0 ? 503 : 200 });
}
