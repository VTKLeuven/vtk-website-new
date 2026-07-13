import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@vtk/auth/server';
import { NextResponse } from 'next/server';

export async function requireSession(redirectTo?: string) {
  const session = await getSession(await headers());
  if (!session) {
    if (redirectTo) redirect(redirectTo);
    throw new Error('UNAUTHENTICATED');
  }
  return session;
}

export async function requirePermission(permission: string) {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !session.permissions.includes(permission)) {
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
