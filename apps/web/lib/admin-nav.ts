// -----------------------------------------------------------------------------
// Admin-navigatie: wat er is en wat bij elkaar hoort.
//
//   Item toevoegen     -> voeg een `item(...)`-regel toe.
//   Groep toevoegen    -> voeg een `group("<key>", [ item(...), ... ])`-blok toe.
//
// `key` heeft een label nodig in de i18n-dictionaries (`admin.<key>`, in
// packages/i18n) en mag een icoon hebben in app/[locale]/admin/AdminNav.tsx.
// Zichtbaarheid regel je met de derde parameter: `{ perm }`, `{ anyPerm }`, of
// `{ superAdminOnly: true }` (weglaten = altijd zichtbaar). Een groep valt
// vanzelf weg als de gebruiker geen enkel sub-item mag zien.
//
// **De volgorde hieronder is de volgorde op het scherm**, ook binnen een groep.
// Dat was ooit alfabetisch, maar zo stond een map van tien schermen tussen twee
// losse tools, en kregen nl en en een andere zijbalk (er werd op het vertaalde
// label gesorteerd). De regel is nu: eerst de domeinen, dan de modules die één
// post beheert, en IT achteraan.
//
// Een module die één post dagelijks gebruikt (Theokot, Fakscanner, Grocomeet)
// blijft voor die post bewust een los item. Voor IT en Groep 5 (die alle rechten
// hebben en anders een overvolle balk zien) worden Fakscanner en Theokot
// gebundeld onder "Overig".
// -----------------------------------------------------------------------------

export type NavGuard = {
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

export type NavLeaf = { key: string; href: string } & NavGuard;
export type NavEntry = NavLeaf | { group: string; items: NavLeaf[] };

const item = (key: string, href: string, guard: NavGuard = {}): NavLeaf => ({
  key,
  href,
  ...guard,
});
const group = (key: string, items: NavLeaf[]): NavEntry => ({ group: key, items });

export function logisticsModuleUrl(): string {
  const configured = process.env.LOGISTIEK_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3100' : 'https://logistiek.dev.vtk.be';
}

export type AdminNavOptions = {
  /** Enkel voor IT en Groep 5: zet Fakscanner en Theokot in een groep "Overig". */
  isItOrG5?: boolean;
};

export function getAdminNav({ isItOrG5 = false }: AdminNavOptions = {}): NavEntry[] {
  const fakscannerItem = item('fakscanner', '/fakscanner', { perm: 'fakscanner.manage' });
  const theokotItem = item('theokot', '/theokot', { anyPerm: ['theokot.manage', 'theokot.pickup'] });

  const looseOrOverig: NavEntry[] = isItOrG5
    ? [
        item('grocomeet', '/grocomeet', { perm: 'grocomeet.manage' }),
        item('logistics', logisticsModuleUrl()),
        item('expenses', '/rekeningen', {
          anyPerm: ['expenses.submit', 'expenses.managePost', 'expenses.manage'],
        }),
        item('vault', '/wachtwoorden', { anyPerm: ['vault.editOwn', 'vault.manage'] }),
        group('overig', [fakscannerItem, theokotItem]),
      ]
    : [
        fakscannerItem,
        item('grocomeet', '/grocomeet', { perm: 'grocomeet.manage' }),
        item('logistics', logisticsModuleUrl()),
        item('expenses', '/rekeningen', {
          anyPerm: ['expenses.submit', 'expenses.managePost', 'expenses.manage'],
        }),
        theokotItem,
        item('vault', '/wachtwoorden', { anyPerm: ['vault.editOwn', 'vault.manage'] }),
      ];

  return [
    // Het dashboard is een groep omdat de tegels erop door elke post aangepast
    // kunnen worden; dat scherm hoort bij het dashboard, niet bij IT.
    group('dashboard', [
      item('dashboardOverview', '', { exact: true }),
      item('dashboardTiles', '/dashboard-tiles'),
    ]),
    // Alles wat een bezoeker op de site ziet, plus de dingen die je daar
    // publiceert zonder dat er per se een evenement aan hangt (formulieren,
    // shiften en piano).
    group('website', [
      item('home', '/home', { perm: 'home.edit' }),
      item('frontpage', '/frontpage', { perm: 'home.edit' }),
      item('openingHours', '/openingsuren', { perm: 'openingHours.manageOwn' }),
      item('announcements', '/aankondigingen', { perm: 'home.edit' }),
      item('linkPage', '/linkpagina', { perm: 'home.edit' }),
      item('header', '/header', { perm: 'pages.manage' }),
      item('pages', '/paginas', { anyPerm: ['pages.edit', 'pages.editAll'] }),
      item('partners', '/partners', { perm: 'partners.manage' }),
      item('shortlinks', '/links', { perm: 'shortlinks.manage' }),
      item('forms', '/formulieren', { forms: true }),
      item('shift', '/shiften', { anyPerm: ['shift.edit', 'shift.reward', 'shift.ranking'] }),
      item('piano', '/piano', { perm: 'piano.manage' }),
    ]),
    // Eén evenement is één ding voor wie het organiseert: je plant het in en je
    // verkoopt er tickets voor.
    group('evenementen', [
      item('calendar', '/kalender', { perm: 'calendar.create' }),
      item('tickets', '/tickets', { ticketing: true }),
    ]),
    group('ledenbeheer', [
      item('users', '/gebruikers', { perm: 'users.view' }),
      item('groups', '/groepen', { perm: 'groups.manage' }),
      item('werkgroepen', '/werkgroepen', { werkgroep: true }),
      item('roles', '/roles', { perm: 'roles.manage' }),
      // Alumni is een adresboek per lichting, geen opt-in mailinglijst: een
      // afgestudeerde geeft per definitie nooit meer een studiebevestiging van
      // dit werkingsjaar. Daarom hier en niet bij Communicatie.
      item('alumni', '/alumni', { perm: 'alumni.manage' }),
      item('kiesploeg', '/kiesploeg', { perm: 'kiesploeg.manage' }),
    ]),
    // Alles wat de kring naar buiten stuurt, en het beeld dat ze publiceert.
    group('communicatie', [
      // Twee dingen die allebei "mailinglijst" heten en bewust naast elkaar
      // staan zodat wie het ene zoekt het andere ziet: de opt-in nieuwsbrieven
      // naar studenten (export + Brevo), en de eigen adressen van de kring
      // (activiteiten@vtk.be) die de posten van dit werkingsjaar volgen.
      item('mailinglists', '/mailinglijsten', { perm: 'mailinglists.export' }),
      item('mailGroups', '/groepsadressen', { perm: 'mailgroups.manage' }),
      item('appPush', '/app-push', { perm: 'app.push' }),
      // Fotoalbums hebben één ingang: /admin/media. Daar staat de Immich-galerij,
      // en dat is de enige bron die de publieke mediapagina leest.
      item('media', '/media', { anyPerm: ['media.manage', 'photos.manageAlbums'] }),
      // Verzoeken om een foto uit de galerij te halen. Naast Media, want dat is
      // waar de albums beheerd worden; alleen `media.manage`, want dit is de
      // enige tab die foto's echt weggooit.
      item('takedowns', '/media/verwijderverzoeken', { perm: 'media.manage' }),
    ]),
    // Wat VTK Onderwijs beheert hangt samen: de POC's zijn de studenten die de
    // opleiding vertegenwoordigen, het bureau is hun vergadering, en de
    // lesbezoeken lopen via dezelfde post.
    group('onderwijs', [
      item('pocs', '/pocs', { perm: 'pocs.manage' }),
      item('bureau', '/bureau', { perm: 'bureau.manage' }),
      item('lesbezoeken', '/lesbezoeken', {
        anyPerm: ['lesbezoeken.view', 'lesbezoeken.manage'],
      }),
    ]),

    // ---------------------------------------------------------------------------
    // Losse modules: elk van één post, of van iedereen. Onderling alfabetisch.
    // Voor IT en G5 worden Fakscanner en Theokot in de overig-groep geplaatst.
    // ---------------------------------------------------------------------------
    ...looseOrOverig,

    group('it', [
      // `exact`, anders licht Configuratie (/admin/it) ook op wanneer je op de
      // onderliggende /admin/it/preview staat.
      item('itConfig', '/it', { superAdminOnly: true, exact: true }),
      item('vaultAdmin', '/wachtwoorden/beheer', { perm: 'vault.manage' }),
      item('auditLog', '/it/logboek', { perm: 'audit.view' }),
      item('door', '/deur', { perm: 'door.manage' }),
      item('sso', '/sso', { perm: 'oauth.client.edit' }),
      item('kulSso', '/it/kul-sso', { superAdminOnly: true }),
      item('authorizationPreview', '/it/preview', { superAdminOnly: true }),
      // De onboarding en de jaarlijkse bevestiging zie je maar één keer; zonder
      // deze pagina is er geen manier om te controleren of ze nog kloppen.
      item('flowPreview', '/it/flows', { superAdminOnly: true }),
      item('urenloopApp', '/it/24ul-app', { perm: 'urenloopApp.manage' }),
    ]),
  ];
}

export const NAV: NavEntry[] = getAdminNav();

/**
 * Elke tab-key die bestaat. De pin-action toetst hieraan, zodat er geen
 * verzonnen keys in `UserAdminNavPin` belanden.
 */
export const ADMIN_NAV_KEYS: ReadonlySet<string> = new Set(
  NAV.flatMap((entry) => ('group' in entry ? entry.items.map((i) => i.key) : [entry.key]))
);
