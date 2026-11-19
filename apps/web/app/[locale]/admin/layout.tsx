import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@vtk/db';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canAccessAnyTicketEvent } from '@/lib/ticketing/authorization';
import { canAccessAnyForm } from '@/lib/forms/authorization';
import { canSeeCommuRequests } from '@/lib/commu/requests';
import { isExternalUrl } from '@/lib/href';
import { getAdminNav, type NavGuard, type NavLeaf } from '@/lib/admin-nav';
import { canSeeMailGroups, mailGroupAccess } from '@/lib/google/access';
import { isPocOnly, representedPocIds } from '@/lib/pocPolls/access';
import { postenAccess } from '@/lib/postenAccess';
import { countsForBo } from '@/lib/bo/own';
import { ADMIN_DENSITY_COOKIE, ADMIN_NAV_COLLAPSED_COOKIE } from '@/lib/adminNavCookie';
import { AdminNav, type NavItem, type NavNode } from './AdminNav';
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
  const canAccessCommuRequests = await canSeeCommuRequests();

  // RiVers van dit werkingsjaar krijgen de tab Peilingen, zonder apart recht.
  const pocRep =
    !session.permissions.includes('pocs.manage') && (await representedPocIds(session.user.id)).length > 0;
  // Een RiVer zonder post of werkgroep komt enkel voor de peilingen: geen
  // dashboard en geen uitleendienst in de zijbalk.
  const pocOnly = await isPocOnly(session);

  // Groepsadressen: wie ze beheert of accounts goedkeurt, en een werkgroep die
  // haar eigen adressen beheert. Dat laatste vraagt pas iets op met het recht.
  const mailGroupsVisible =
    session.permissions.includes('mailgroups.manage') ||
    session.permissions.includes('googleAccounts.manage') ||
    (session.permissions.includes('werkgroepen.manageOwnMembers') &&
      canSeeMailGroups(await mailGroupAccess(session)));

  // Posten & werkgroepen: één item voor vier tabbladen met elk hun eigen recht.
  const posten = await postenAccess(session);
  const postenVisible = posten.posts || posten.werkgroepen || posten.jaarwerkingen || posten.kiesploeg;

  // Mag de huidige gebruiker deze entry zien? Superadmin ziet alles.
  const canSee = (guard: NavGuard): boolean => {
    if (session.user.isSuperAdmin) return true;
    if (guard.superAdminOnly) return false;
    if (guard.notForPocOnly && pocOnly) return false;
    // Ticketing-tab hangt af van ticket-toegang (eigen grant of globale perm),
    // niet van de gewone admin-permissies. canAccessTickets dekt superadmins al.
    if (guard.ticketing) return canAccessTickets;
    if (guard.forms) return canAccessForms;
    if (guard.commuRequests) return canAccessCommuRequests;
    // Werkgroepen-tab: beheerders óf gewone werkgroepleden.
    if (guard.werkgroep) return posten.werkgroepen;
    if (guard.jaarwerking) return posten.jaarwerkingen;
    // Mijn budgetten: elk lid van een post en de G3/G4 van een werkgroep, voor
    // zijn eigen post. Een gewoon werkgroeplid en een jaarwerking tellen niet
    // (zie `countsForBo` in lib/bo/own.ts).
    if (guard.post) return session.groups.some(countsForBo);
    if (guard.pocRep) return session.permissions.includes('pocs.manage') || pocRep;
    if (guard.mailGroups) return mailGroupsVisible;
    if (guard.posten) return postenVisible;
    if (guard.anyPerm) return guard.anyPerm.some((p) => session.permissions.includes(p));
    if (guard.perm) return session.permissions.includes(guard.perm);
    return true;
  };

  const toItem = (leaf: NavLeaf): NavItem => ({
    key: leaf.key,
    href: isExternalUrl(leaf.href) ? leaf.href : `${base}/admin${leaf.href}`,
    label: adminDict[leaf.key],
    exact: leaf.exact,
    hidden: leaf.hidden,
  });

  // Bouw de zichtbare nav. De volgorde staat vast in admin-nav.ts, ook
  // binnen een groep; er wordt hier niet meer gesorteerd. Iedereen krijgt
  // dezelfde balk: welke tabs je ziet hangt enkel van je rechten af, niet van
  // je post.
  const nodes: NavNode[] = [];
  const nav = getAdminNav();
  for (const entry of nav) {
    if ('group' in entry) {
      const items = entry.items.filter(canSee).map(toItem);
      // Een groep waarvan je maar één item mag zien, is een klik om niets: toon
      // dat item dan gewoon als los item. Behalve bij een groep die bewust
      // groeit (Apps): die blijft staan, zodat het item niet van plaats wisselt.
      // Verborgen items tellen niet mee: die staan niet in de lijst. Ze gaan
      // wel mee in de nodes, voor het zoeken en de pins.
      const listed = items.filter((i) => !i.hidden);
      if (listed.length === 1 && !entry.keepSingle) {
        nodes.push({ type: 'item', item: listed[0] });
        for (const hidden of items.filter((i) => i.hidden)) nodes.push({ type: 'item', item: hidden });
      } else if (items.length > 0) {
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

  const cookieStore = await cookies();
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
        <section className="vtk-admin-main">{children}</section>
      </div>
    </AdminSurface>
  );
}
