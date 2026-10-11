import { cookies } from 'next/headers';
import { LoginGate } from '@/components/login-gate';
import { ToastProvider } from '@/components/ui/toast';
import { ADMIN_NAV_COLLAPSED_COOKIE } from '@/lib/admin-nav-cookie';
import { canManage, getSession } from '@/lib/session';
import { BeheerNav } from './beheer-nav';
import { copy, getLocale } from '@/lib/i18n';

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

  return (
    <ToastProvider>
      {/* Geen maximumbreedte (F4.6, D1): de hele uitleendienst gebruikt het
          venster dat ze krijgt. Het inklappen van de zijbalk wint enkel de
          breedte van die zijbalk; op het scherm waar dit om begonnen was, de
          weekplanning, is dat precies de winst die telt. */}
      <main className="logistics-gutter flex-1 py-8">
        <div data-print="hide" className="border-b border-vtk-navy/10 pb-5">
          <p className="flex items-center gap-2 text-sm text-vtk-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
            {t.manageKicker}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">{t.manageTitle}</h1>
        </div>

        {/* Sticky, de rail en de sneltoets zitten in AdminNav; het 860px-breekpunt
            van de kolommen staat bij `.logistics-admin-layout` in globals.css. */}
        <div className="logistics-admin-layout mt-8">
          <aside data-print="hide">
            <BeheerNav
              collapsed={collapsed}
              collapseLabels={{ collapse: t.collapseNav, expand: t.expandNav, shortcut: t.collapseNavShortcut }}
            />
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </ToastProvider>
  );
}
