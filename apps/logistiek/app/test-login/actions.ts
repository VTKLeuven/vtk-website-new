'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { canUseTestLogin, getRealSession } from '@/lib/session';
import { TEST_USER_COOKIE, ensureTestUser, isTestUserKey } from '@/lib/test-users';

/**
 * Zet de test-gebruiker-cookie en stuurt naar de home. redirect() gooit, dus
 * buiten try/catch.
 *
 * **De poort staat hier, niet enkel op de picker.** Een server action is een
 * endpoint: wie de picker niet te zien krijgt, kan ze nog altijd rechtstreeks
 * aanroepen. Zonder deze regel volstond het kennen van de naam van een profiel
 * om superadmin te worden.
 */
export async function loginAsTestUser(formData: FormData): Promise<void> {
  if (!(await canUseTestLogin())) return;
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

/**
 * Wist de test-gebruiker-cookie: terug naar je eigen account.
 *
 * Ongegrendeld, en dat is met opzet: je eigen cookie weggooien mag altijd. Een
 * controle hier zou net iemand kunnen vastzetten in een profiel op het moment
 * dat hij zijn rechten verliest.
 *
 * Heb je een echte sessie, dan ga je naar de home; die is nu weer van jou. Zonder
 * echte sessie (de ongegrendelde stand op een laptop) belandt je op de picker,
 * want anders sta je op een pagina waar je niet meer ingelogd bent.
 */
export async function logoutTestUser(): Promise<void> {
  (await cookies()).delete(TEST_USER_COOKIE);
  const real = await getRealSession();
  redirect(real ? '/' : '/test-login');
}
