import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@vtk/auth/server';
import type { Permission } from '@vtk/auth';
import { NextResponse } from 'next/server';

/**
 * Request-deduped session read. Wrapped in React `cache` so the several server
 * components that need the session within one render (layout onboarding gate,
 * Header, the page itself) share a single DB round-trip.
 */
export const getCurrentSession = cache(async () => getSession(await headers()));

export async function requireSession(redirectTo?: string) {
  const session = await getCurrentSession();
  if (!session) {
    if (redirectTo) redirect(redirectTo);
    throw new Error('UNAUTHENTICATED');
  }
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !session.permissions.includes(permission)) {
    throw new Error('FORBIDDEN');
  }
  return session;
}

/**
 * Toegang zodra de gebruiker één van de rechten heeft. Voor schermen die meerdere
 * rechten bundelen (bv. /admin/inhoud met `pages.edit` én `header.manage`); gate
 * de onderdelen daar zelf nog per recht.
 */
export async function requireAnyPermission(permissions: Permission[]) {
  const session = await requireSession();
  if (
    !session.user.isSuperAdmin &&
    !permissions.some((p) => session.permissions.includes(p))
  ) {
    throw new Error('FORBIDDEN');
  }
  return session;
}

/**
 * Zet een gegooide auth-fout uit {@link requirePermission}/`requireSession` om in
 * een JSON-response. `FORBIDDEN` wordt 403, al de rest (o.a. `UNAUTHENTICATED`) 401.
 */
export function authErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : 'UNAUTHENTICATED';
  const status = message === 'FORBIDDEN' ? 403 : 401;
  return NextResponse.json({ error: message }, { status });
}
