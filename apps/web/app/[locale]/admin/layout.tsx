import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canAccessAnyTicketEvent } from '@/lib/ticketing/authorization';
import { canAccessAnyForm } from '@/lib/forms/authorization';
import { isExternalUrl } from '@/lib/href';
import { getAdminNav, type NavGuard, type NavLeaf } from '@/lib/admin-nav';
import { AdminNav, type NavItem, type NavNode } from './AdminNav';

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
  const base = locale === 'nl' ? '' : '/en';

  const adminDict = dict.admin as DictAdmin & { [key: string]: string };
  const canAccessTickets =
    session.user.isSuperAdmin ||
    session.permissions.includes('tickets.create') ||
    session.permissions.includes('tickets.manageAll') ||
    (await canAccessAnyTicketEvent());
  // Zelfde redenering als bij ticketing: een grant op één formulier is genoeg om
  // de tab te zien, ook zonder een van de globale formulierpermissies.
  const canAccessForms = session.user.isSuperAdmin || (await canAccessAnyForm());

  // Is de gebruiker lid van minstens één werkgroep (huidig werkingsjaar)? Zij
  // krijgen de Werkgroepen-tab om enkel hun eigen infotekst te bewerken.
  const werkgroepMember =
    session.groups.length > 0 &&
    (await prisma.group.count({
      where: { type: 'WERKGROEP', id: { in: session.groups.map((g) => g.id) } },
    })) > 0;

  // Mag de huidige gebruiker deze entry zien? Superadmin ziet alles.
  const canSee = (guard: NavGuard): boolean => {
    if (session.user.isSuperAdmin) return true;
    if (guard.superAdminOnly) return false;
    // Ticketing-tab hangt af van ticket-toegang (eigen grant of globale perm),
    // niet van de gewone admin-permissies. canAccessTickets dekt superadmins al.
    if (guard.ticketing) return canAccessTickets;
    if (guard.forms) return canAccessForms;
    // Werkgroepen-tab: beheerders óf gewone werkgroepleden.
    if (guard.werkgroep) return session.permissions.includes('werkgroepen.manage') || werkgroepMember;
    if (guard.anyPerm) return guard.anyPerm.some((p) => session.permissions.includes(p));
    if (guard.perm) return session.permissions.includes(guard.perm);
    return true;
  };

  const toItem = (leaf: NavLeaf): NavItem => ({
    key: leaf.key,
    href: isExternalUrl(leaf.href) ? leaf.href : `${base}/admin${leaf.href}`,
    label: adminDict[leaf.key],
    exact: leaf.exact,
  });

  // Is de huidige gebruiker lid van IT of Groep 5 (of superadmin)?
  // Enkel voor IT en G5 worden Fakscanner en Theokot onder een tabje "Overig" gegroepeerd.
  const isItOrG5 =
    session.user.isSuperAdmin ||
    session.groups.some(
      (g) =>
        ['IT', 'GROEP5', 'G5'].includes(g.code.toUpperCase()) ||
        ['it', 'groep-5', 'g5'].includes(g.slug.toLowerCase())
    );

  // Bouw de zichtbare nav. De volgorde staat vast in admin-nav.ts, ook
  // binnen een groep; er wordt hier niet meer gesorteerd.
  const nodes: NavNode[] = [];
  const nav = getAdminNav({ isItOrG5 });
  for (const entry of nav) {
    if ('group' in entry) {
      const items = entry.items.filter(canSee).map(toItem);
      // Een groep waarvan je maar één item mag zien, is een klik om niets: toon
      // dat item dan gewoon als los item.
      if (items.length === 1) {
        nodes.push({ type: 'item', item: items[0] });
      } else if (items.length > 1) {
        nodes.push({ type: 'group', key: entry.group, label: adminDict[entry.group], items });
      }
    } else if (canSee(entry)) {
      nodes.push({ type: 'item', item: toItem(entry) });
    }
  }

  // Vastgepinde tabs van deze gebruiker. Keys die hij niet (meer) mag zien
  // blijven staan in de databank maar renderen niet; zie AdminNav.
  const pins = await prisma.userAdminNavPin.findMany({
    where: { userId: session.user.id },
    orderBy: { order: 'asc' },
    select: { key: true },
  });

  return (
    <div className="vtk-admin-surface">
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
          />
        </aside>
        <section className="vtk-admin-main">{children}</section>
      </div>
    </div>
  );
}
