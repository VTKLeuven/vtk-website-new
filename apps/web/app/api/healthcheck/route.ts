import { healthcheckResponse } from "@/lib/healthcheck";

export const dynamic = "force-dynamic";

/**
 * Het pad waarop de statuspagina's van de kring staan ingesteld, sinds de
 * vorige site. Zie `lib/healthcheck.ts` voor de check zelf en voor waarom die
 * niet in een van beide routes staat.
 */
export async function GET() {
  return healthcheckResponse();
}
