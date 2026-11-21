import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LoginGate } from '@/components/login-gate';
import { ADMIN_NAV_COLLAPSED_COOKIE } from '@/lib/admin-nav-cookie';
import { canManage, getSession } from '@/lib/session';
import { BeheerNav } from './beheer-nav';
import { copy, getLocale } from '@/lib/i18n';

/**
 * "Ritaanvragen · Beheer uitleendienst": een tabblad van het beheer is niet te
 * verwarren met de pagina van een lid die toevallig even heet (Flesserke).
 * Een sjabloon geldt niet voor het segment zelf, enkel voor de pagina's eronder.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = copy[await getLocale()];
  return { title: { default: t.manageTitle, template: `%s · ${t.manageTitle}` } };
}

export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="manage" returnTo="/beheer" />;
  }
  if (!canManage(session)) {
    return (
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-5 py-12">
        <section className="w-full max-w-xl rounded-[22px] border border-vtk-navy/10 bg-vtk-surface p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-vtk-ink">{t.noAccess}</h1>
          <p className="mt-3 leading-7 text-vtk-body">
            Het beheer van de uitleendienst is voorbehouden voor het team van Logistiek. Denk je dat dit een vergissing
            is, mail dan logistiek@vtk.be.
          </p>
        </section>
      </main>
    );
  }

  const collapsed = (await cookies()).get(ADMIN_NAV_COLLAPSED_COOKIE)?.value === '1';

  // Geen maximumbreedte (F4.6, D1): de hele uitleendienst gebruikt het venster
  // dat ze krijgt. Het inklappen van de zijbalk wint enkel de breedte van die
  // zijbalk; op het scherm waar dit om begonnen was, de weekplanning, is dat
  // precies de winst die telt.
  return (
    <main className="logistics-gutter flex-1 py-6 md:py-8">
      {/* De titel enkel voor een screenreader (M2, C2). Het zichtbare blok
          "VTK Logistiek / Beheer uitleendienst" herhaalde wat de zijbalk al
          zegt, en kostte op een telefoon honderd pixels voor er iets van het
          werk te zien was. */}
      <h1 className="sr-only">{t.manageTitle}</h1>

      {/* Sticky, de rail en de sneltoets zitten in AdminNav; het 860px-breekpunt
          van de kolommen staat bij `.logistics-admin-layout` in globals.css. */}
      <div className="logistics-admin-layout">
        <aside data-print="hide">
          <BeheerNav
            collapsed={collapsed}
            collapseLabels={{ collapse: t.collapseNav, expand: t.expandNav, shortcut: t.collapseNavShortcut }}
          />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
