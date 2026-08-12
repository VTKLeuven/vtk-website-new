'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TEST_USER_COOKIE, ensureTestUser, isTestUserKey, testLoginEnabled } from '@/lib/test-users';

/**
 * Zet de test-gebruiker-cookie en stuurt naar de home. Enkel actief als de
 * env-toggle aan staat; anders no-op. redirect() gooit, dus buiten try/catch.
 */
export async function loginAsTestUser(formData: FormData): Promise<void> {
  if (!testLoginEnabled()) return;
  const key = formData.get('key');
  if (typeof key !== 'string' || !isTestUserKey(key)) return;

  // De uitleen-aanvragen leggen een FK op userId; zorg dat de test-gebruiker als
  // echte User-rij bestaat voor we de sessie-cookie zetten.
  await ensureTestUser(key);

  (await cookies()).set(TEST_USER_COOKIE, key, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/');
}

/** Wist de test-gebruiker-cookie en keert terug naar de picker. */
export async function logoutTestUser(): Promise<void> {
  if (!testLoginEnabled()) return;
  (await cookies()).delete(TEST_USER_COOKIE);
  redirect('/test-login');
}
