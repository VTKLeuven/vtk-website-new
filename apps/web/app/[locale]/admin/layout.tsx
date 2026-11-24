import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@vtk/db';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { ADMIN_DENSITY_COOKIE, ADMIN_NAV_COLLAPSED_COOKIE } from '@/lib/adminNavCookie';
import { isAiConfigured } from '@/lib/ai/config';
import { AiTranslateProvider } from '@/components/admin/AiTranslateContext';
import { visibleAdminNav } from '@/lib/admin-nav-visible';
import { AdminNav, type NavNode } from './AdminNav';
import { AdminSurface } from './AdminSurface';

import '@/app/design/vtk-admin.css';

type DictAdmin = ReturnType<typeof getDictionary>['admin'];

/**
 * Eén keer op de layout, niet per pagina: alles onder /admin staat achter een
 * login en hoort in geen enkele zoekmachine. De admin-schermen krijgen bewust
 * geen verdere metadata; ze worden nooit gedeeld als link.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession(
    `${locale === 'nl' ? '' : '/en'}/inloggen?next=${locale === 'nl' ? '' : '/en'}/admin`
  );
  const dict = getDictionary(locale);

  const adminDict = dict.admin as DictAdmin & { [key: string]: string };
  // De zijbalk volgens je rechten; dezelfde lijst krijgt de app (`/api/app/v1/beheer`).
  const nodes: NavNode[] = await visibleAdminNav(session, locale);

  // Vastgepinde tabs van deze gebruiker. Keys die hij niet (meer) mag zien
  // blijven staan in de databank maar renderen niet; zie AdminNav.
  const pins = await prisma.userAdminNavPin.findMany({
    where: { userId: session.user.id },
    orderBy: { order: 'asc' },
    select: { key: true },
  });

  const [cookieStore, aiEnabled] = await Promise.all([cookies(), isAiConfigured()]);
  const collapsed = cookieStore.get(ADMIN_NAV_COLLAPSED_COOKIE)?.value === '1';
  const compact = cookieStore.get(ADMIN_DENSITY_COOKIE)?.value === 'compact';

  return (
    <AdminSurface initialCompact={compact}>
      <div className="vtk-admin-surface-inner">
        {/* Sticky/scrollgedrag staat in AdminNav (useSmartSticky) plus het
            860px-breekpunt in vtk-admin.css (niet Tailwinds md:, dat 768px is). */}
        <aside>
          <AdminNav
            title={dict.admin.title}
            nodes={nodes}
            pinnedKeys={pins.map((p) => p.key)}
            pinLabels={{
              section: adminDict.pinned,
              all: adminDict.allTabs,
              pin: adminDict.pinTab,
              unpin: adminDict.unpinTab,
              error: adminDict.pinError,
            }}
            collapsed={collapsed}
            collapseLabels={{
              collapse: adminDict.collapseNav,
              expand: adminDict.expandNav,
              shortcut: adminDict.collapseNavShortcut,
            }}
            searchLabels={{
              open: adminDict.searchNav,
              placeholder: adminDict.searchNavPlaceholder,
              empty: adminDict.searchNavEmpty,
            }}
            densityLabel={adminDict.compactView}
          />
        </aside>
        <section className="vtk-admin-main">
          <AiTranslateProvider enabled={aiEnabled} locale={locale}>
            {children}
          </AiTranslateProvider>
        </section>
      </div>
    </AdminSurface>
  );
}
