import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@vtk/auth/server';

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
