import Image from 'next/image';
import Link from 'next/link';
import { getSession, canManageFakbar } from '@/lib/session';
import { testLoginEnabled } from '@/lib/test-users';
import { HeaderShell } from './header-shell';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

export type HeaderLink = { href: string; label: string };

const LINKS: HeaderLink[] = [
  { href: '/drankkaart', label: 'Drankkaart' },
  { href: '/openingsuren', label: 'Openingsuren' },
  { href: "/fotos", label: "Foto's" },
  { href: '/verhuur', label: 'Verhuur' },
];

/* Zelfde structuur als de header van vtk.be en van de uitleendienst; de
   navigatie is specifiek voor de fakbar. Het interactieve deel (menupaneel,
   profielmenu, transparantie over de hero) zit in HeaderShell. */
export async function SiteHeader() {
  const session = await getSession();
  const isFakbar = session ? canManageFakbar(session) : false;
  // Op een testomgeving wijst de login naar de test-picker in plaats van naar
  // de KU Leuven-login op de hoofdsite. Zie lib/test-users.ts.
  const testMode = testLoginEnabled();

  const links = isFakbar ? [...LINKS, { href: '/admin', label: 'Beheer' }] : LINKS;

  return (
    <HeaderShell
      links={links}
      brand={
        <Link href="/" className="brand" aria-label="'t ElixIr, startpagina">
          <Image
            src="/elixir-logo.png"
            alt="'t ElixIr"
            width={500}
            height={500}
            className="h-9 w-auto object-contain"
            priority
          />
        </Link>
      }
      user={session ? { name: session.user.name, canManage: isFakbar } : null}
      mainUrl={MAIN_URL}
      loginHref={testMode ? '/test-login' : `${MAIN_URL}/inloggen`}
      testLoginHref={testMode ? '/test-login' : undefined}
    />
  );
}
