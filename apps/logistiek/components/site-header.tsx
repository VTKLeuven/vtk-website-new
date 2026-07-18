import Image from 'next/image';
import Link from 'next/link';
import { canManage, getSession } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { LanguageSwitcher } from './language-switcher';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

/* Het compacte VTK-lockup volgt het beeldmerk van de hoofdsite: schild links,
   naam rechts en de werking eronder. */
export async function SiteHeader() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];

  return (
    <header className="border-b border-white/10 bg-vtk-navy text-white">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-9">
        <Link href="/" className="flex items-center gap-3" aria-label="VTK Logistiek, startpagina">
          <Image
            src="/VTK.png"
            alt=""
            width={660}
            height={777}
            className="h-10 w-auto"
            priority
          />
          <span className="grid leading-none">
            <span className="text-[25px] font-semibold tracking-[-0.045em] text-white">VTK</span>
            <span className="mt-0.5 text-[16px] font-medium tracking-[-0.025em] text-white/70">
              Logistiek
            </span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/80 sm:ml-4">
          <Link href="/materiaal" className="transition hover:text-white">
            {t.navMaterial}
          </Link>
          <Link href="/camionette" className="transition hover:text-white">
            {t.navVan}
          </Link>
          {session ? (
            <Link href="/reservaties" className="transition hover:text-white">
              {t.navReservations}
            </Link>
          ) : null}
          {session && canManage(session) ? (
            <Link
              href="/beheer"
              className="rounded-full border border-white/25 px-3 py-1 font-medium transition hover:border-white/60 hover:text-white"
            >
              {t.navManage}
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {session ? (
            <span className="hidden text-white/70 sm:inline">{session.user.name}</span>
          ) : (
            <Link
              href={`${MAIN_URL}/inloggen`}
              className="rounded-full bg-vtk-yellow px-4 py-1.5 font-semibold text-vtk-ink transition hover:bg-vtk-yellow-dark"
            >
              {t.signIn}
            </Link>
          )}
          <LanguageSwitcher locale={locale} />
          <a href={MAIN_URL} className="text-white/60 transition hover:text-white">
            {t.site}
          </a>
        </div>
      </div>
    </header>
  );
}
