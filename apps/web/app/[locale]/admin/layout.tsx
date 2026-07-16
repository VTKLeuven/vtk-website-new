import { notFound } from 'next/navigation';
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
    item('pocs', '/pocs', { perm: 'pocs.manage' }),
    item('roles', '/roles', { perm: 'roles.manage' }),
  ]),
  item('mailinglists', '/mailinglijsten', { perm: 'mailinglists.export' }),
  item('pages', '/paginas', { anyPerm: ['pages.edit', 'pages.editAll'] }),
  item('content', '/inhoud', { perm: 'pages.manage' }),
  item('calendar', '/kalender', { perm: 'calendar.create' }),
  item('tickets', '/tickets', { ticketing: true }),
  item('albums', '/albums', { perm: 'photos.manageAlbums' }),
  item('media', '/media', { perm: 'media.manage' }),
  item('partners', '/partners', { perm: 'partners.manage' }),
  item('home', '/home', { perm: 'home.edit' }),
  item('dashboardTiles', '/dashboard-tiles', { perm: 'dashboard.manage' }),
  item('shortlinks', '/links', { perm: 'shortlinks.manage' }),
  item('shift', '/shiften', { anyPerm: ['shift.edit', 'shift.reward', 'shift.ranking'] }),
  item('theokot', '/theokot', { anyPerm: ['theokot.manage', 'theokot.pickup'] }),
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
    session.permissions.includes("tickets.create") ||
    session.permissions.includes("tickets.manageAll") ||
    (await canAccessAnyTicketEvent());

  // Mag de huidige gebruiker deze entry zien? Superadmin ziet alles.
  const canSee = (guard: NavGuard): boolean => {
    if (session.user.isSuperAdmin) return true;
    if (guard.superAdminOnly) return false;
    // Ticketing-tab hangt af van ticket-toegang (eigen grant of globale perm),
    // niet van de gewone admin-permissies. canAccessTickets dekt superadmins al.
    if (guard.ticketing) return canAccessTickets;
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

  // Bouw de nav in bronvolgorde. Een groep valt weg als geen enkel sub-item zichtbaar is.
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

  return (
    <div className="vtk-admin-surface">
      <div className="vtk-admin-surface-inner">
        <aside className="md:sticky md:top-24 self-start">
          <AdminNav title={dict.admin.title} nodes={nodes} />
        </aside>
        <section className="vtk-admin-main">{children}</section>
      </div>
    </div>
  );
}
