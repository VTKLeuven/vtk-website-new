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
import { NextResponse, type NextRequest } from 'next/server';
import { RouteContext, RouteHandler, ApiHandlers } from '../index';
import { notFound, notFoundHandlers, methodNotAllowed } from './basicHandlers';

const betterAuthHandlers: ApiHandlers = toNextJsHandler(auth);

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
