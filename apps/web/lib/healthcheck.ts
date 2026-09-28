import { prisma } from "@vtk/db";

/**
 * Zegt of de server nog antwoordt en de database bereikt, en verder niets: geen
 * versie, geen configuratie, want dit adres is publiek.
 *
 * Bewust goedkoop (één `SELECT 1`), want Docker vraagt het elke 30 seconden.
 *
 * Staat hier en niet in een van de twee routes. Er zijn twee paden:
 * `/api/healthcheck`, waarop de statuspagina's van de kring al sinds de vorige
 * site staan ingesteld, en `/api/health`, dat de healthcheck van de
 * web-container in `infra/docker-compose.yml` bevraagt. Die routes mogen
 * elkaar niet herexporteren: `next build` weigert een route-segmentoptie
 * (`dynamic`) die uit een andere module komt, want ze wordt bij het compileren
 * statisch uitgelezen. Ze roepen dus allebei deze functie aan, en er blijft één
 * implementatie.
 */
export async function healthcheckResponse(): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
