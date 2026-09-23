import { prisma } from "@vtk/db";

export const dynamic = "force-dynamic";

/**
 * Voor de healthcheck van de web-container (infra/docker-compose.yml). Zegt of
 * de server nog antwoordt en de database bereikt, en verder niets: geen
 * versie, geen configuratie, want dit adres is publiek.
 *
 * Bewust goedkoop (één `SELECT 1`), want Docker vraagt het elke 30 seconden.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
