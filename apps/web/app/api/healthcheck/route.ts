import { prisma } from "@vtk/db";

export const dynamic = "force-dynamic";

/**
 * Zegt of de server nog antwoordt en de database bereikt, en verder niets: geen
 * versie, geen configuratie, want dit adres is publiek.
 *
 * Bewust goedkoop (één `SELECT 1`), want Docker vraagt het elke 30 seconden.
 *
 * Twee paden, één implementatie. `/api/healthcheck` is het pad waarop de
 * statuspagina's van de kring al sinds de vorige site staan ingesteld, en dat
 * verhuist niet zomaar; `/api/health` is wat de healthcheck van de
 * web-container in `infra/docker-compose.yml` bevraagt. Die tweede route
 * herexporteert deze. Zet er dus geen kopie naast: dan lopen ze uiteen en zegt
 * de statuspagina iets anders dan Docker.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
