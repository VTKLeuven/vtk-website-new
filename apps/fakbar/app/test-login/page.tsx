import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  ensureTestUser,
  isTestUserKey,
  testLoginEnabled,
  testPersonaLanding,
  testPersonas,
  TEST_USER_COOKIE,
} from '@/lib/test-users';

export const metadata: Metadata = { title: 'Test-login', robots: { index: false, follow: false } };

/**
 * De test-picker voor lokale dev. Staat de vlag uit, dan bestaat deze route
 * niet: hij mag niet als lege pagina blijven staan op een omgeving waar hij
 * niets doet.
 *
 * De lijst komt uit `testPersonas()`, zodat een extra testgebruiker één regel
 * in `lib/test-users.ts` is en niet ook nog een knop hier.
 */
export default async function TestLoginPage() {
  if (!testLoginEnabled()) notFound();

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">Lokale dev</p>
          <h1>Test-login</h1>
          <p className="fakbar-page-intro">
            Enkel beschikbaar wanneer <code>FAKBAR_TEST_LOGIN=true</code> staat. Op productie is dit weg en verloopt
            het inloggen via de KU Leuven-login op vtk.be.
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="grid max-w-2xl gap-3">
          {testPersonas().map((persona) => (
            <form key={persona.key} action={loginAs}>
              <input type="hidden" name="key" value={persona.key} />
              <button type="submit" className="fakbar-test-login-option">
                <span className="name">{persona.name}</span>
                <span className="description">{persona.description}</span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </>
  );
}

async function loginAs(formData: FormData) {
  'use server';
  if (!testLoginEnabled()) return;
  const key = formData.get('key');
  if (typeof key !== 'string' || !isTestUserKey(key)) return;
  await ensureTestUser(key);
  (await cookies()).set(TEST_USER_COOKIE, key, { path: '/', maxAge: 60 * 60 * 24 });
  redirect(testPersonaLanding(key));
}
