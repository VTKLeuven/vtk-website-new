import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import {
  TEST_USER_COOKIE,
  isTestUserKey,
  listTestPersonas,
  testLoginEnabled,
} from '@/lib/test-users';
import { loginAsTestUser, logoutTestUser } from './actions';

/**
 * Test-login picker. Enkel bereikbaar als de env-toggle `LOGISTIEK_TEST_LOGIN`
 * aan staat (anders 404). Kies een vast test-profiel om als die persoon in te
 * loggen; zie lib/test-users.ts. NOOIT aanzetten in productie.
 */
export default async function TestLoginPage() {
  if (!testLoginEnabled()) notFound();

  const locale = await getLocale();
  const nl = locale === 'nl';
  const personas = listTestPersonas();
  const active = (await cookies()).get(TEST_USER_COOKIE)?.value;
  const activeKey = isTestUserKey(active) ? active : null;

  return (
    <main
      className="logistics-auth mx-auto grid w-full flex-1 items-start justify-items-center px-5 py-12"
      // .logistics-auth zet overflow:hidden (voor de vaste navy-achtergrond),
      // wat main een scroll-container met min-height:0 maakt: een lijst hoger dan
      // het scherm wordt dan afgekapt. Enkel de y-as terug scrollbaar zetten.
      style={{ overflowY: 'auto' }}
    >
      <section className="logistics-auth-panel w-full max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-vtk-yellow">Test login</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-vtk-ink">
          {nl ? 'Kies een test-gebruiker' : 'Pick a test user'}
        </h1>
        <p className="mt-4 leading-7 text-vtk-body">
          {nl
            ? 'Dit scherm is enkel actief op een testomgeving (LOGISTIEK_TEST_LOGIN=true). Elk profiel dekt een ander toegangsniveau.'
            : 'This screen is only active on a test environment (LOGISTIEK_TEST_LOGIN=true). Each profile covers a different access level.'}
        </p>

        <ul className="mt-7 flex flex-col gap-3">
          {personas.map((p) => {
            const isActive = p.key === activeKey;
            return (
              <li key={p.key}>
                <form action={loginAsTestUser}>
                  <input type="hidden" name="key" value={p.key} />
                  <button
                    type="submit"
                    className="flex w-full items-start justify-between gap-4 rounded-2xl border border-vtk-navy/15 bg-vtk-surface px-5 py-4 text-left transition hover:border-vtk-navy/40 hover:bg-vtk-blue-soft"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-vtk-ink">{p.name}</span>
                      <span className="mt-1 block text-sm leading-6 text-vtk-body">
                        {nl ? p.descriptionNl : p.descriptionEn}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 text-sm font-semibold text-vtk-navy"
                    >
                      {isActive ? (nl ? 'Actief' : 'Active') : '→'}
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        {activeKey ? (
          <form action={logoutTestUser} className="mt-6">
            <button type="submit" className="text-sm font-semibold text-vtk-muted underline">
              {nl ? 'Uitloggen (test-gebruiker wissen)' : 'Log out (clear test user)'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
