import { headers, cookies } from 'next/headers';
import { type SessionPayload, isMemberOfGroup } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';
import { TEST_USER_COOKIE, buildTestSession, isTestUserKey, testLoginEnabled } from './test-users';

export async function getSession(): Promise<SessionPayload | null> {
  if (testLoginEnabled()) {
    const key = (await cookies()).get(TEST_USER_COOKIE)?.value;
    if (isTestUserKey(key)) return buildTestSession(key);
  }
  return fetchSession(await headers());
}

export function canManageFakbar(session: SessionPayload): boolean {
  return isMemberOfGroup(session, 'FAKBAR') || session.user.isSuperAdmin;
}
