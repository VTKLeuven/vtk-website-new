import { notFound } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import { canUseTestLogin, getImpersonation, getRealSession } from '@/lib/session';
import { listTestPersonas } from '@/lib/test-users';
import { loginAsTestUser, logoutTestUser } from './actions';

/**
 * Test-login picker. Enkel bereikbaar voor wie mag wisselen: in productie
 * niemand, op een gedeelde testomgeving enkel IT en Logistiek, en op een laptop
 * (`LOGISTIEK_TEST_LOGIN=open`) iedereen omdat daar geen echte login bestaat.
 * Anders 404: een 403 zou het bestaan van dit scherm nog altijd verklappen.
 */
export default async function TestLoginPage() {
  if (!(await canUseTestLogin())) notFound();

  const locale = await getLocale();
  const nl = locale === 'nl';
  const personas = listTestPersonas();
  const [impersonation, real] = await Promise.all([getImpersonation(), getRealSession()]);
  const activeKey = impersonation?.personaKey ?? null;

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
            ? 'Dit scherm is enkel actief op een testomgeving, en enkel voor IT en Logistiek. Elk profiel dekt een ander toegangsniveau.'
            : 'This screen is only active on a test environment, and only for IT and Logistics. Each profile covers a different access level.'}
        </p>

        {/* Wie je zelf bent, met de weg terug. Zonder dit was de enige uitgang
            een linkje onderaan de lijst, en dat vind je pas als je al weet dat
            het bestaat. */}
        {real ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-vtk-navy/15 bg-vtk-blue-soft px-4 py-3">
            <p className="min-w-0 text-sm text-vtk-body">
              {nl ? 'Je eigen account: ' : 'Your own account: '}
              <span className="font-semibold text-vtk-ink">{real.user.name}</span>
            </p>
            {activeKey ? (
              <form action={logoutTestUser}>
                <button
                  type="submit"
                  className="rounded-full border border-vtk-navy/25 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/60"
                >
                  {nl ? 'Terug naar mijn account' : 'Back to my account'}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

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

        {/* Zonder echte sessie staat de weg terug niet in het blok hierboven, en
            is dit de enige uitgang. */}
        {activeKey && !real ? (
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
