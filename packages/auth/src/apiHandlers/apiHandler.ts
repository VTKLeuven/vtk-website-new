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

const handlers: ApiHandlers = toNextJsHandler(auth);

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
