import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canAccessAnyTicketEvent } from '@/lib/ticketing/authorization';
import { canAccessAnyForm } from '@/lib/forms/authorization';
import { AdminNav, type NavItem, type NavNode } from './AdminNav';

import '@/app/design/vtk-admin.css';

// -----------------------------------------------------------------------------
// Admin-navigatie. Op het scherm staat alles alfabetisch (dashboard bovenaan);
// deze lijst bepaalt dus enkel wat er is en wat bij elkaar hoort.
//
//   Item toevoegen     -> voeg een `item(...)`-regel toe.
//   Groep toevoegen    -> voeg een `group("<key>", [ item(...), ... ])`-blok toe.
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
  /** Formulieren-tab: zichtbaar bij een eigen formulier-grant of een globale formulier-permissie. */
  forms?: boolean;
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
    item('frontpage', '/frontpage', { perm: 'home.edit' }),
    item('announcements', '/aankondigingen', { perm: 'home.edit' }),
    item('linkPage', '/linkpagina', { perm: 'home.edit' }),
    item('content', '/inhoud', { perm: 'pages.manage' }),
    item('pages', '/paginas', { anyPerm: ['pages.edit', 'pages.editAll'] }),
    item('partners', '/partners', { perm: 'partners.manage' }),
  ]),
  // Verkorte links zijn geen website-inhoud: ze leven op hun eigen domein
  // (on.vtk.be) en verwijzen naar eender waar. Daarom geen onderdeel van de
  // websitegroep, maar een eigen item.
  item('shortlinks', '/links', { perm: 'shortlinks.manage' }),
  // Eén evenement is één ding voor wie het organiseert: je plant het in en je
  // verkoopt er tickets voor. Die twee schermen hoorden daarom onder één tab.
  group('evenementen', [
    item('calendar', '/kalender', { perm: 'calendar.create' }),
    item('tickets', '/tickets', { ticketing: true }),
  ]),
  item('forms', '/formulieren', { forms: true }),
  // Fotoalbums hebben één ingang: /admin/media. Daar staat de Immich-galerij,
  // en dat is de enige bron die de publieke mediapagina leest. De oude
  // /admin/albums beheerde een tweede, lokale albumopslag die nergens meer
  // getoond werd.
  item('media', '/media', { anyPerm: ['media.manage', 'photos.manageAlbums'] }),
  item('shift', '/shiften', { anyPerm: ['shift.edit', 'shift.reward', 'shift.ranking'] }),
  item('theokot', '/theokot', { anyPerm: ['theokot.manage', 'theokot.pickup'] }),
  item('grocomeet', '/grocomeet', { perm: 'grocomeet.manage' }),
  item('bureau', '/bureau', { perm: 'bureau.manage' }),
  item('piano', '/piano', { perm: 'piano.manage' }),
  item('fakscanner', '/fakscanner', { perm: 'fakscanner.manage' }),
  item('mailinglists', '/mailinglijsten', { perm: 'mailinglists.export' }),
  item('dashboardTiles', '/dashboard-tiles', { perm: 'dashboard.manage' }),
  group('it', [
    // `exact`, anders licht Configuratie (/admin/it) ook op wanneer je op de
    // onderliggende /admin/it/preview staat.
    item('itConfig', '/it', { superAdminOnly: true, exact: true }),
    item('authorizationPreview', '/it/preview', { superAdminOnly: true }),
    item('auditLog', '/it/logboek', { perm: 'audit.view' }),
    item('door', '/deur', { perm: 'door.manage' }),
    item('sso', '/sso', { perm: 'oauth.client.edit' }),
  ]),
];

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
    href: `${base}/admin${leaf.href}`,
    label: adminDict[leaf.key],
    exact: leaf.exact,
  });

  // Bouw de zichtbare nav. De volgorde in NAV hierboven bepaalt enkel nog welke
  // items bij elkaar staan; op het scherm staat alles alfabetisch, met het
  // dashboard vastgepind bovenaan. Zoeken in een lijst van vijftien tabs gaat zo
  // sneller dan onthouden waar iemand ze ooit gezet heeft. Gevolg: nl en en
  // hebben een andere volgorde, want er wordt op het vertaalde label gesorteerd.
  const collator = new Intl.Collator(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    sensitivity: 'base',
  });
  const byLabel = (a: { label: string }, b: { label: string }) =>
    collator.compare(a.label, b.label);

  const nodes: NavNode[] = [];
  for (const entry of NAV) {
    if ('group' in entry) {
      const items = entry.items.filter(canSee).map(toItem).sort(byLabel);
      if (items.length > 0) {
        nodes.push({ type: 'group', key: entry.group, label: adminDict[entry.group], items });
      }
    } else if (canSee(entry)) {
      nodes.push({ type: 'item', item: toItem(entry) });
    }
  }

  const isDashboard = (node: NavNode) => node.type === 'item' && node.item.key === 'dashboard';
  nodes.sort((a, b) => {
    if (isDashboard(a) !== isDashboard(b)) return isDashboard(a) ? -1 : 1;
    return collator.compare(
      a.type === 'group' ? a.label : a.item.label,
      b.type === 'group' ? b.label : b.item.label,
    );
  });

  return (
    <div className="vtk-admin-surface">
      <div className="vtk-admin-surface-inner">
        {/* Sticky/scrollgedrag staat in AdminNav (useSmartSticky) plus het
            860px-breekpunt in vtk-admin.css (niet Tailwinds md:, dat 768px is). */}
        <aside>
          <AdminNav title={dict.admin.title} nodes={nodes} />
        </aside>
        <section className="vtk-admin-main">{children}</section>
      </div>
    </div>
  );
}
