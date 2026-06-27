import { headers } from 'next/headers';
import { isMemberOfGroup, type SessionPayload } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';

export async function requireLogistiek(): Promise<SessionPayload> {
  const session = await fetchSession(await headers());
  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }
  if (!session.user.isSuperAdmin && !isMemberOfGroup(session, 'Logistiek')) {
    throw new Error('FORBIDDEN');
  }
  return session;
}
