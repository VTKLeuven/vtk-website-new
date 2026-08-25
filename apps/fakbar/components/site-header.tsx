import Image from 'next/image';
import Link from 'next/link';
import { getSession, canManageFakbar } from '@/lib/session';
import { testLoginEnabled } from '@/lib/test-users';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

function AnonymousUserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M6.5 19.25v-.5c0-2.35 2.02-4.25 5.5-4.25s5.5 1.9 5.5 4.25v.5" />
    </svg>
  );
}

export async function SiteHeader() {
  const session = await getSession();
  const isFakbar = session ? canManageFakbar(session) : false;
  const testMode = testLoginEnabled();

  return (
    <header className="vtk-site-header">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="'t ElixIr, startpagina">
          <Image
            src="/elixir-logo.png"
            alt="'t ElixIr"
            width={500}
            height={500}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        <div className="nav-links-shell">
          <nav className="nav-links" aria-label="Hoofdnavigatie">
            <Link href="/drankkaart">Drankkaart</Link>
            <Link href="/fotos">Foto's</Link>
            <Link href="/verhuur">Verhuur</Link>
            {isFakbar && <Link href="/admin">Beheer</Link>}
          </nav>
        </div>

        <div className="nav-right">
          {session ? (
            <div className="profile-menu-root">
              <span className="profile-menu-trigger" title={session.user.name}>
                {session.user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          ) : (
            <a
              href={testMode ? '/test-login' : `${MAIN_URL}/inloggen`}
              aria-label="Inloggen"
              title="Inloggen"
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
