import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canAccessAnyTicketEvent } from '@/lib/ticketing/authorization';
import { AdminNav, type NavItem, type NavNode } from './AdminNav';

import '@/app/design/vtk-admin.css';

// -----------------------------------------------------------------------------
// Admin-navigatie. De volgorde hieronder is exact de volgorde in de linkerkolom.
//
//   Item toevoegen     -> voeg een `item(...)`-regel toe waar je het wil zien.
//   Groep toevoegen    -> voeg een `group("<key>", [ item(...), ... ])`-blok toe.
//   Volgorde wijzigen  -> versleep de regels/blokken (bovenaan = bovenaan).
//
// `key` heeft een label nodig in de i18n-dictionaries (`admin.<key>`, in
// packages/i18n) en mag een icoon hebben in AdminNav.tsx. Zichtbaarheid regel je
// met de derde parameter: `{ perm }`, `{ anyPerm }`, of `{ superAdminOnly: true }`
// (weglaten = altijd zichtbaar). Een groep valt vanzelf weg als de gebruiker geen
// enkel sub-item mag zien.
// -----------------------------------------------------------------------------

type NavGuard = {
  perm?: string;
  anyPerm?: string[];
  superAdminOnly?: boolean;
  /** Ticketing-tab: zichtbaar bij een eigen event-grant of een globale ticket-permissie. */
  ticketing?: boolean;
  /** Werkgroepen-tab: zichtbaar voor beheerders (werkgroepen.manage) en voor leden
   *  van een werkgroep (die zien enkel hun eigen werkgroep, enkel de infotekst). */
  werkgroep?: boolean;
  /** Enkel bij exacte padmatch actief markeren (voor de dashboard-landing op /admin). */
  exact?: boolean;
};
type NavLeaf = { key: string; href: string } & NavGuard;
type NavEntry = NavLeaf | { group: string; items: NavLeaf[] };

const item = (key: string, href: string, guard: NavGuard = {}): NavLeaf => ({
  key,
  href,
  ...guard,
});
const group = (key: string, items: NavLeaf[]) => ({ group: key, items });

const NAV: NavEntry[] = [
  item('dashboard', '', { exact: true }),
  group('ledenbeheer', [
    item('users', '/gebruikers', { perm: 'users.view' }),
    item('groups', '/groepen', { perm: 'groups.manage' }),
    item('werkgroepen', '/werkgroepen', { werkgroep: true }),
    item('pocs', '/pocs', { perm: 'pocs.manage' }),
    item('roles', '/roles', { perm: 'roles.manage' }),
  ]),
  group('website', [
    item('home', '/home', { perm: 'home.edit' }),
    item('content', '/inhoud', { perm: 'pages.manage' }),
    item('pages', '/paginas', { anyPerm: ['pages.edit', 'pages.editAll'] }),
    item('partners', '/partners', { perm: 'partners.manage' }),
  ]),
  item('mailinglists', '/mailinglijsten', { perm: 'mailinglists.export' }),
  item('calendar', '/kalender', { perm: 'calendar.create' }),
  item('tickets', '/tickets', { ticketing: true }),
  item('albums', '/albums', { perm: 'photos.manageAlbums' }),
  item('media', '/media', { perm: 'media.manage' }),
  item('dashboardTiles', '/dashboard-tiles', { perm: 'dashboard.manage' }),
  item('shortlinks', '/links', { perm: 'shortlinks.manage' }),
  item('shift', '/shiften', { anyPerm: ['shift.edit', 'shift.reward', 'shift.ranking'] }),
  item('theokot', '/theokot', { anyPerm: ['theokot.manage', 'theokot.pickup'] }),
  item('sso', '/sso', { perm: 'oauth.client.edit' }),
  item('door', '/deur', { perm: 'door.manage' }),
  item('it', '/it', { superAdminOnly: true }),
];

type DictAdmin = ReturnType<typeof getDictionary>['admin'];

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
    // Werkgroepen-tab: beheerders óf gewone werkgroepleden.
    if (guard.werkgroep) return session.permissions.includes('werkgroepen.manage') || werkgroepMember;
    if (guard.anyPerm) return guard.anyPerm.some((p) => session.permissions.includes(p));
    if (guard.perm) return session.permissions.includes(guard.perm);
    return true;
  };

  const toItem = (leaf: NavLeaf): NavItem => ({
    key: leaf.key,
    href: `${base}/admin${leaf.href}`,
    label: adminDict[leaf.key],
    exact: leaf.exact,
  });

  // Bouw de zichtbare nav en sorteer daarna op het gelokaliseerde label. Het
  // dashboard blijft bewust de vaste eerste entry; groepen blijven bij elkaar
  // en hun eigen items worden afzonderlijk alfabetisch gesorteerd.
  const nodes: NavNode[] = [];
  for (const entry of NAV) {
    if ('group' in entry) {
      const items = entry.items.filter(canSee).map(toItem);
      if (items.length > 0) {
        nodes.push({ type: 'group', key: entry.group, label: adminDict[entry.group], items });
      }
    } else if (canSee(entry)) {
      nodes.push({ type: 'item', item: toItem(entry) });
    }
  }

  const collator = new Intl.Collator(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    sensitivity: 'base',
    numeric: true,
  });
  for (const node of nodes) {
    if (node.type === 'group') {
      node.items.sort((a, b) => collator.compare(a.label, b.label));
    }
  }
  nodes.sort((a, b) => {
    const aDashboard = a.type === 'item' && a.item.key === 'dashboard';
    const bDashboard = b.type === 'item' && b.item.key === 'dashboard';
    if (aDashboard !== bDashboard) return aDashboard ? -1 : 1;
    const aLabel = a.type === 'group' ? a.label : a.item.label;
    const bLabel = b.type === 'group' ? b.label : b.item.label;
    return collator.compare(aLabel, bLabel);
  });

  return (
    <div className="vtk-admin-surface">
      <div className="vtk-admin-surface-inner">
        {/* Sticky/scrollgedrag staat in vtk-admin.css, op het 860px-breekpunt van
            de tweekolomslayout (niet op Tailwinds md:, dat 768px is). */}
        <aside>
          <AdminNav title={dict.admin.title} nodes={nodes} />
        </aside>
        <section className="vtk-admin-main">{children}</section>
      </div>
    </div>
  );
}
