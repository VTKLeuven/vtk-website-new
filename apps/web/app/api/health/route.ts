/**
 * Het pad dat de healthcheck van de web-container bevraagt
 * (`infra/docker-compose.yml`). De statuspagina's van de kring staan op
 * `/api/healthcheck` ingesteld, dus daar staat de implementatie; dit is
 * hetzelfde antwoord op het andere pad.
 */
export { GET, dynamic } from "../healthcheck/route";
