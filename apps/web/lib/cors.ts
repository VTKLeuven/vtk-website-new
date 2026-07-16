/**
 * CORS voor de shift-mutatie-endpoints (create/edit/delete), zodat andere
 * *.vtk.be-apps ze vanuit de browser kunnen aanroepen met de gedeelde
 * sessiecookie.
 *
 * Belangrijk: CORS opent enkel de deur voor vertrouwde origins. De échte
 * autorisatie (sessie + `shift.edit`) blijft volledig in de handler zelf — een
 * toegelaten origin krijgt nog steeds 401/403 zonder geldige sessie/rechten.
 */

// Productie: enkel https-subdomeinen (en de apex) van vtk.be. Dev: localhost
// (elke poort), zodat submodule-apps lokaal ook werken. Sluit aan bij de
// `trustedOrigins` in packages/auth/src/auth.ts.
const ORIGIN_ALLOWLIST =
  process.env.NODE_ENV === 'production'
    ? /^https:\/\/([a-z0-9-]+\.)*vtk\.be$/i
    : /^https?:\/\/localhost:\d+$/i;

/** Geeft de request-origin terug als die toegelaten is, anders null. */
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  return origin && ORIGIN_ALLOWLIST.test(origin) ? origin : null;
}

/**
 * Voegt de CORS-antwoordheaders toe wanneer de origin vertrouwd is. Bij een
 * niet-toegelaten (of ontbrekende) origin blijft de response ongewijzigd, zodat
 * same-origin gedrag en niet-vertrouwde origins niets extra krijgen.
 */
export function applyCors(request: Request, response: Response): Response {
  const origin = allowedOrigin(request);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

/** Wrapt een route-handler zodat elk antwoord (ook fouten) de CORS-headers krijgt. */
export function withCors(
  handler: (request: Request) => Promise<Response> | Response,
): (request: Request) => Promise<Response> {
  return async (request) => applyCors(request, await handler(request));
}

/**
 * Preflight-antwoord (OPTIONS). Adverteert enkel de toegelaten methodes en
 * `Content-Type` (voor JSON-bodies). Enkel voor vertrouwde origins voegen we de
 * preflight-headers toe.
 */
export function corsPreflight(
  request: Request,
  methods = 'POST, PATCH, DELETE, OPTIONS',
): Response {
  const response = applyCors(request, new Response(null, { status: 204 }));
  if (response.headers.has('Access-Control-Allow-Origin')) {
    response.headers.set('Access-Control-Allow-Methods', methods);
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
  return response;
}
