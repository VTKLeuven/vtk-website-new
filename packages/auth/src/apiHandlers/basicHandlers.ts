/**
 * @author Witse Panneels
 */
import type { ApiHandlers, RouteHandler, RouteContext } from '../index';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * RouteHandler for non existing paths
 *
 * Returns a 404 response
 */
export function notFound(): Response {
  return NextResponse.json(
    { error: 'Not found' },
    {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * notFound route handlers for all possible http methods
 */
export function notFoundHandlers(): ApiHandlers {
  return {
    GET: notFound,
    POST: notFound,
    PATCH: notFound,
    PUT: notFound,
    DELETE: notFound,
  };
}

/**
 * @param allow methods that are allowed on this endpoint
 * @returns RouteHandler with a 405 http response
 */
export function methodNotAllowed(allow: string): RouteHandler {
  return (request: NextRequest, context: RouteContext) =>
    NextResponse.json(
      { error: 'Method not allowed' },
      {
        status: 405,
        headers: {
          Allow: allow,
          'Cache-Control': 'no-store',
        },
      }
    );
}
