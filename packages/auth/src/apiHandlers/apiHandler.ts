/**
 * @author Witse Panneels
 * @date 2026-06-25
 *
 * /api/auth/[...all] voor de main web app
 *
 * /api/auth/better/[...] => normale better-auth endpoints voor gebruik door de main app
 * /api/auth/remote/[...] => endpoints voor remote apps om sessions te valideren
 */

import 'server-only';
import { auth } from '../auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { getSession } from '../server/session';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_BASE_PATH, RouteContext, RouteHandler, ApiHandlers } from '../index';
import { notFound, notFoundHandlers, methodNotAllowed } from './basicHandlers';

import { prisma } from '@vtk/db';

const handlers: ApiHandlers = toNextJsHandler(auth);

/**
 * Paden waarop een OAuth-client zich kan authenticeren met client_secret_basic
 * of client_secret_post.
 */
const OAUTH_CLIENT_AUTH_PATHS = new Set([
  `${AUTH_BASE_PATH}/oauth2/token`,
  `${AUTH_BASE_PATH}/oauth2/revoke`,
  `${AUTH_BASE_PATH}/oauth2/introspect`,
]);

function encodeBasicCredentials(clientId: string, clientSecret: string): string {
  const formUrlEncode = (val: string) => new URLSearchParams({ v: val }).toString().slice(2);
  const payload = `${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`;
  return `Basic ${Buffer.from(payload).toString('base64')}`;
}

function decodeBasicCredentials(authorization: string): { clientId: string; clientSecret: string } | null {
  const match = authorization.match(/^Basic +(.*)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;
    const rawClientId = decoded.slice(0, separatorIndex);
    const rawClientSecret = decoded.slice(separatorIndex + 1);
    const formUrlDecode = (val: string) => new URLSearchParams(`v=${val}`).get('v') ?? val;
    return {
      clientId: formUrlDecode(rawClientId),
      clientSecret: formUrlDecode(rawClientSecret),
    };
  } catch {
    return null;
  }
}

/**
 * Ondersteunt zowel `client_secret_basic` als `client_secret_post` voor alle
 * vertrouwelijke clients.
 *
 * Better Auth 1.7 introduceerde een strikte controle: een client geregistreerd
 * voor `client_secret_basic` (de standaard als `tokenEndpointAuthMethod` leeg is)
 * mag géén `client_secret_post` meer sturen en faalt met:
 *   "client registered for client_secret_basic cannot use client_secret_post".
 *
 * Externe applicaties (zoals BurgieClan met Symfony / league/oauth2-client, of
 * clients in Go, Python, etc.) sturen credentials standaard in de POST body.
 * In RFC 6749 (§2.3.1) zijn beide methoden gelijkwaardig voor gedeelde geheimen.
 *
 * Deze helper normaliseert de transportmethode naar wat in de databank staat
 * (of vice versa), zodat elke client via beide methoden kan aanmelden zonder
 * dat een library-update of configuratieverschil de flow breekt.
 */
export async function normalizeOAuthClientAuth(request: NextRequest): Promise<NextRequest> {
  const url = new URL(request.url);
  if (!OAUTH_CLIENT_AUTH_PATHS.has(url.pathname)) return request;

  const authHeader = request.headers.get('authorization');
  const contentType = request.headers.get('content-type') || '';

  const basicAuth = authHeader ? decodeBasicCredentials(authHeader) : null;

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return request;
  }

  const isForm = contentType.includes('application/x-www-form-urlencoded');
  const isJson = contentType.includes('application/json');

  let bodyClientId: string | null = null;
  let bodyClientSecret: string | null = null;
  let formParams: URLSearchParams | null = null;
  let jsonBody: Record<string, unknown> | null = null;

  if (isForm) {
    formParams = new URLSearchParams(bodyText);
    bodyClientId = formParams.get('client_id');
    bodyClientSecret = formParams.get('client_secret');
  } else if (isJson) {
    try {
      jsonBody = JSON.parse(bodyText);
      if (jsonBody && typeof jsonBody === 'object') {
        if (typeof jsonBody.client_id === 'string') bodyClientId = jsonBody.client_id;
        if (typeof jsonBody.client_secret === 'string') bodyClientSecret = jsonBody.client_secret;
      }
    } catch {
      // ignore
    }
  }

  // Geval A: client stuurt client_secret_post (geheimen in body, geen Basic header)
  if (!basicAuth && bodyClientId && bodyClientSecret) {
    const dbClient = await prisma.oauthClient
      .findUnique({
        where: { clientId: bodyClientId },
        select: { tokenEndpointAuthMethod: true },
      })
      .catch(() => null);

    // Als de client in de databank geregistreerd staat voor client_secret_basic (of null/leeg, wat better-auth
    // als client_secret_basic interpreteert), zet de credentials dan om naar de Authorization: Basic header.
    if (!dbClient || dbClient.tokenEndpointAuthMethod !== 'client_secret_post') {
      const headers = new Headers(request.headers);
      headers.set('authorization', encodeBasicCredentials(bodyClientId, bodyClientSecret));

      let newBody: string;
      if (isForm && formParams) {
        formParams.delete('client_secret');
        newBody = formParams.toString();
      } else if (isJson && jsonBody) {
        const { client_secret: _, ...rest } = jsonBody;
        newBody = JSON.stringify(rest);
      } else {
        newBody = bodyText;
      }

      return new NextRequest(url, {
        method: request.method,
        headers,
        body: newBody,
      });
    }
  }

  // Geval B: client stuurt client_secret_basic, maar staat geregistreerd voor client_secret_post
  if (basicAuth) {
    const dbClient = await prisma.oauthClient
      .findUnique({
        where: { clientId: basicAuth.clientId },
        select: { tokenEndpointAuthMethod: true },
      })
      .catch(() => null);

    if (dbClient?.tokenEndpointAuthMethod === 'client_secret_post') {
      const headers = new Headers(request.headers);
      headers.delete('authorization');

      let newBody: string;
      if (isForm) {
        const p = formParams ?? new URLSearchParams(bodyText);
        p.set('client_id', basicAuth.clientId);
        p.set('client_secret', basicAuth.clientSecret);
        newBody = p.toString();
      } else if (isJson) {
        const j = jsonBody ?? (JSON.parse(bodyText) as Record<string, unknown>);
        j.client_id = basicAuth.clientId;
        j.client_secret = basicAuth.clientSecret;
        newBody = JSON.stringify(j);
      } else {
        headers.set('content-type', 'application/x-www-form-urlencoded');
        const p = new URLSearchParams({
          client_id: basicAuth.clientId,
          client_secret: basicAuth.clientSecret,
        });
        newBody = p.toString();
      }

      return new NextRequest(url, {
        method: request.method,
        headers,
        body: newBody,
      });
    }
  }

  return new NextRequest(url, {
    method: request.method,
    headers: request.headers,
    body: bodyText,
  });
}

/**
 * Het pad waarop een terugkerende student binnenkomt, met één providersegment
 * erachter. Vandaag hangt daar enkel `KUL_CALLBACK_PATH` aan.
 */
const LEGACY_CALLBACK_PREFIX = `${AUTH_BASE_PATH}/oauth2/callback/`;

/**
 * Geeft de oude callback van de `genericOAuth`-plugin door aan de core-route.
 *
 * Better Auth 1.7 bedient elke provider vanaf `/callback/<provider>` en
 * registreert `/oauth2/callback/<provider>` niet meer, terwijl dat laatste bij
 * ICTS geregistreerd staat als onze redirect-URI. Zonder deze doorgifte krijgt
 * de student die terugkomt van idp.kuleuven.be een 404. Zie
 * `KUL_CALLBACK_PATH` in index.ts.
 *
 * Andere `/oauth2/...`-paden zijn van onze eigen OAuth-provider en blijven
 * ongemoeid: enkel `oauth2/callback/<één segment>` wordt verlegd.
 */
function toCoreCallback(request: NextRequest): NextRequest {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(LEGACY_CALLBACK_PREFIX)) return request;

  const provider = url.pathname.slice(LEGACY_CALLBACK_PREFIX.length);
  if (!provider || provider.includes('/')) return request;

  url.pathname = `${AUTH_BASE_PATH}/callback/${provider}`;
  return new NextRequest(url, request);
}

const betterAuthHandlers: ApiHandlers = {
  ...handlers,
  GET: (request, context) => handlers.GET(toCoreCallback(request), context),
  POST: async (request, context) => handlers.POST(await normalizeOAuthClientAuth(request), context),
};

const remoteHandlers: ApiHandlers = {
  GET: async function (request: NextRequest, context: RouteContext): Promise<Response> {
    const temp = await context.params;
    const params: string[] = temp.all ?? [];

    if (!params[1] || params.length > 2) return notFound();
    if (params[1] != 'session') return notFound();

    // /api/auth/remote/session
    const session = await getSession(request.headers);

    if (!session) {
      return NextResponse.json(null, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(session, {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
  POST: methodNotAllowed('GET'),
  PATCH: methodNotAllowed('GET'),
  PUT: methodNotAllowed('GET'),
  DELETE: methodNotAllowed('GET'),
};

/**
 * Select where the API response has to go to based on path
 * @param context current route context
 */
async function selectHandler(context: RouteContext): Promise<ApiHandlers> {
  const temp = await context.params;
  const params: string[] = temp.all ?? [];

  if (!params[0]) return notFoundHandlers();

  switch (params[0]) {
    case 'better':
      return betterAuthHandlers;
    case 'remote':
      return remoteHandlers;
    default:
      return notFoundHandlers();
  }
}

/**
 * @returns ApiHandlers for the main web app
 */
export function ApiHandler(): ApiHandlers {
  return {
    GET: async (request, context) => (await selectHandler(context)).GET(request, context),
    POST: async (request, context) => (await selectHandler(context)).POST(request, context),
    PATCH: async (request, context) => (await selectHandler(context)).PATCH(request, context),
    PUT: async (request, context) => (await selectHandler(context)).PUT(request, context),
    DELETE: async (request, context) => (await selectHandler(context)).DELETE(request, context),
  };
}
