import Image from 'next/image';
import Link from 'next/link';
import { canManage, getSession } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { testLoginEnabled } from '@/lib/test-users';
import { LanguageSwitcher } from './language-switcher';
import { ProfileMenu } from './profile-menu';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

function AnonymousUserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M6.5 19.25v-.5c0-2.35 2.02-4.25 5.5-4.25s5.5 1.9 5.5 4.25v.5" />
    </svg>
  );
}

/* Zelfde visuele en structurele header als vtk.be, met navigatie die specifiek
   is voor de uitleendienst. */
export async function SiteHeader() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  // Op een testomgeving verwijst de login naar de test-picker in plaats van naar
  // de KU Leuven-login op de hoofdsite. Zie lib/test-users.ts.
  const testMode = testLoginEnabled();

  return (
    <header className="vtk-site-header">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="VTK Logistiek, startpagina">
          <Image
            src="/vtk-logo.png"
            alt=""
            width={1152}
            height={650}
            className="brand-logo-img"
            priority
          />
        </Link>

        <div className="nav-links-shell">
          <nav className="nav-links" aria-label={locale === 'nl' ? 'Hoofdnavigatie' : 'Main navigation'}>
            <Link href="/materiaal">
              {t.navMaterial}
            </Link>
            <Link href="/vervoer">
              {t.navVan}
            </Link>
            {session && session.groups.length > 0 ? (
              <Link href="/flesserke">
                {t.navFlesserke}
              </Link>
            ) : null}
            {session ? (
              <Link href="/reservaties">
                {t.navReservations}
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="nav-right">
          <LanguageSwitcher locale={locale} />
          {session ? (
            <ProfileMenu
              name={session.user.name}
              canManage={canManage(session)}
              mainUrl={MAIN_URL}
              testLoginHref={testMode ? '/test-login' : undefined}
              labels={{
                mainSite: t.profileMainSite,
                manage: t.navManage,
                testLogin: locale === 'nl' ? 'Wissel test-gebruiker' : 'Switch test user',
              }}
            />
          ) : (
            <a
              href={testMode ? '/test-login' : `${MAIN_URL}/inloggen`}
              aria-label={t.signIn}
              title={t.signIn}
              className="nav-login"
            >
              <AnonymousUserIcon className="h-[1.125rem] w-[1.125rem]" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
