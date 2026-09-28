import { healthcheckResponse } from "@/lib/healthcheck";

export const dynamic = "force-dynamic";

/**
 * Het pad dat de healthcheck van de web-container bevraagt
 * (`infra/docker-compose.yml`). Zelfde antwoord als `/api/healthcheck`; zie
 * `lib/healthcheck.ts`.
 */
export async function GET() {
  return healthcheckResponse();
}
