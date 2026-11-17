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
// Een module die één post dagelijks gebruikt (Fakscanner, Grocomeet) blijft
// bewust een los item. Theokot is er twee (broodjes en verhuur, later ook de
// uitleendienst) en staat daarom als eigen groep, naast Onderwijs en
// Communicatie. Iedereen ziet dezelfde balk: er was ooit een groep "Overig" die
// Fakscanner en Theokot enkel voor IT en Groep 5 samennam, maar dan stond
// hetzelfde onderdeel voor de ene post ergens anders dan voor de andere, en was
// het voor precies de mensen die het meest in het beheer zitten een klik verder
// weg.
// -----------------------------------------------------------------------------

export type NavGuard = {
  perm?: string;
  anyPerm?: string[];
  superAdminOnly?: boolean;
  /** Ticketing-tab: zichtbaar bij een eigen event-grant of een globale ticket-permissie. */
  ticketing?: boolean;
  /** Formulieren-tab: zichtbaar bij een eigen formulier-grant of een globale formulier-permissie. */
  forms?: boolean;
  /** Commu-aanvragen: elke post (om aan te vragen) en wie de aanvragen opvolgt
   *  (de grants op het aanvraagformulier); zie lib/commu/requests.ts. */
  commuRequests?: boolean;
  /** Werkgroepen-tab: zichtbaar voor beheerders (werkgroepen.manage) en voor leden
   *  van een werkgroep (die zien enkel hun eigen werkgroep, enkel de infotekst). */
  werkgroep?: boolean;
  /** Jaarwerkingen-tab: zichtbaar voor beheerders (jaarwerkingen.manage) en voor
   *  de verantwoordelijke die de leden van zijn eigen jaarwerking beheert
   *  (jaarwerkingen.manageOwnMembers). Een gewoon lid heeft er niets te doen:
   *  een jaarwerking heeft geen infotekst. */
  jaarwerking?: boolean;
  /** Wie dit werkingsjaar in een post of werkgroep zit (Mijn budgetten). */
  post?: boolean;
  /** Peilingen: de RiVers van dit werkingsjaar, en wie `pocs.manage` heeft. */
  pocRep?: boolean;
  /** Groepsadressen: `mailgroups.manage`, `googleAccounts.manage`, of een werkgroep
   *  die haar eigen adressen beheert (zie lib/google/access.ts). */
  mailGroups?: boolean;
  /** Posten & werkgroepen: wie minstens één van de vier tabbladen mag zien (lib/postenAccess.ts). */
  posten?: boolean;
  /** Enkel bij exacte padmatch actief markeren (voor de dashboard-landing op /admin). */
  exact?: boolean;
  /**
   * Een tabblad van een module die zelf al een item heeft (de tabbladen van IT,
   * Alumni onder Leden). Staat niet in de lijst, maar zoeken vindt het en een
   * pin erop blijft werken. Zie `hidden` in packages/ui/src/AdminNav.tsx.
   */
  hidden?: boolean;
};

export type NavLeaf = { key: string; href: string } & NavGuard;
export type NavGroup = {
  group: string;
  items: NavLeaf[];
  /**
   * Toon de groep ook wanneer er maar één item in zit (of zichtbaar is). Enkel
   * voor een groep die bewust zal groeien, zoals Apps: anders verhuist dat ene
   * item naar een losse tab en springt het terug in de groep zodra er een
   * tweede bijkomt.
   */
  keepSingle?: boolean;
};
export type NavEntry = NavLeaf | NavGroup;

const item = (key: string, href: string, guard: NavGuard = {}): NavLeaf => ({
  key,
  href,
  ...guard,
});
const group = (key: string, items: NavLeaf[], options: { keepSingle?: boolean } = {}): NavEntry => ({
  group: key,
  items,
  ...options,
});

/**
 * Zelfde variabele en zelfde regel als de zoekresultaten
 * (`lib/search-server.ts`) en de postbeheerlinks (`lib/postAdminLinks.ts`):
 * kennen we het adres niet, dan tonen we de tab niet. Een link naar een adres
 * dat we niet kennen is erger dan geen link.
 *
 * Hier stond `https://logistiek.dev.vtk.be` als standaard buiten development,
 * dus zonder LOGISTIEK_PUBLIC_URL stuurde de beheeromgeving van productie je
 * naar de uitleendienst van dev; met de sessiecookie van `.vtk.be` erbij viel
 * dat niet eens op aan de login.
 */
export function logisticsModuleUrl(): string | null {
  const configured = process.env.LOGISTIEK_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3100' : null;
}

export function getAdminNav(): NavEntry[] {
  const logistics = logisticsModuleUrl();
  const loose: NavEntry[] = [
    // Kleine hulpmiddelen die een post af en toe nodig heeft (de groepjesmaker
    // van onthaal en internationaal), elk als item onder één groep in plaats
    // van elk een eigen tab. Er komen er nog bij, dus de groep blijft staan,
    // ook met één app. De groepjesmaker draait op een form, dus ze volgt de
    // zichtbaarheid van Forms.
    group('apps', [item('groupMaker', '/apps/groepjesmaker', { forms: true })], {
      keepSingle: true,
    }),
    item('grocomeet', '/grocomeet', { perm: 'grocomeet.manage' }),
    ...(logistics ? [item('logistics', logistics)] : []),
    // Beheer: alles wat met het geld van de kring te maken heeft, onder één
    // groep in plaats van vier losse tabs. Wie maar één ervan mag zien (een
    // praesidiumlid dat enkel een rekening indient), krijgt dat ene item
    // vanzelf terug als losse tab (zie de layout).
    group('beheer', [
      item('expenses', '/rekeningen', {
        anyPerm: ['expenses.submit', 'expenses.managePost', 'expenses.reimbursePost', 'expenses.manage'],
      }),
      // Een post vraagt hier een kassa met wisselgeld aan, en Beheer maakt,
      // telt en boekt ze.
      item('cashRegisters', '/kassas', { anyPerm: ['cashRegisters.request', 'cashRegisters.manage'] }),
      // Het werk van de penning. De codes zelf kiest wie een ticketverkoop
      // maakt, in het eventformulier; hier wordt enkel de lijst beheerd.
      item('accountingCodes', '/boekhoudcodes', { perm: 'accounting.manage' }),
      // Wat er via Payconiq en Mollie binnenkwam, per boekhoudcode: de opvolger
      // van het rekenblad "Oriëntatie Online Inkomsten".
      item('income', '/inkomsten', { perm: 'income.manage' }),
      // De budgetten en resultaten die langs het Bestuursorgaan passeerden.
      // Enkel Groep 5 (de rol admin draagt dit recht niet).
      item('bestuursorgaan', '/bestuursorgaan', { perm: 'bestuursorgaan.manage' }),
      // Hetzelfde voor de eigen post, voor elk lid van een post of werkgroep:
      // welke resultaten nog naar het BO moeten.
      item('bestuursorgaanOwn', '/bestuursorgaan/mijn', { post: true }),
      // Alles per BO in een map, zoals in Drive: de eigen post, of alles voor Groep 5.
      item('bestuursorgaanFolders', '/bestuursorgaan/mappen', { post: true }),
    ]),
    // Theokot doet twee dingen die weinig met elkaar te maken hebben: broodjes
    // verkopen en de zaal verhuren. Later komt de uitleendienst erbij. Daarom
    // een groep en geen los item; wie maar één van de twee mag zien, krijgt dat
    // ene item vanzelf terug als losse tab (zie de layout).
    group('theokot', [
      item('theokotBroodjes', '/theokot', { anyPerm: ['theokot.manage', 'theokot.pickup'] }),
      item('theokotVerhuur', '/theokot/verhuur', {
        anyPerm: ['theokot.rentals.view', 'theokot.rentals.manage'],
      }),
      // De shiften van een werkweek als tijdlijn: waar er nog shifters nodig
      // zijn. Een eigen pagina en geen tab binnen Broodjes, op vraag van Theokot.
      item('theokotShiften', '/theokot/shiften', { perm: 'theokot.manage' }),
    ]),
    // Google Admin: de groepsadressen, de @vtk.be-accounts en hun
    // organisatie-eenheden, met tabbladen in de pagina zelf. Stond onder
    // Communicatie als "Groepsadressen", maar de accounts en OU's zijn het werk
    // van IT en de vice, niet van communicatie.
    item('mailGroups', '/groepsadressen', { mailGroups: true }),
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
      item('openingHours', '/openingsuren', { perm: 'openingHours.manageOwn' }),
      item('announcements', '/aankondigingen', { perm: 'announcements.manage' }),
      item('news', '/nieuws', { perm: 'news.manage' }),
      item('header', '/header', { perm: 'pages.manage' }),
      item('pages', '/paginas', { anyPerm: ['pages.edit', 'pages.editAll'] }),
      item('partners', '/partners', { perm: 'partners.manage' }),
      item('shortlinks', '/links', { perm: 'shortlinks.manage' }),
      item('forms', '/formulieren', { forms: true }),
      item('shift', '/shiften', {
        anyPerm: ['shift.edit', 'shift.editAll', 'shift.reward', 'shift.ranking', 'shift.templates', 'shift.manual'],
      }),
      item('piano', '/piano', { perm: 'piano.manage' }),
      item('urenloop', '/24urenloop', { perm: 'urenloop.manage' }),
    ]),
    // Eén evenement is één ding voor wie het organiseert: je plant het in en je
    // verkoopt er tickets voor.
    group('evenementen', [
      item('calendar', '/kalender', { perm: 'calendar.create' }),
      item('tickets', '/tickets', { ticketing: true }),
    ]),
    group('ledenbeheer', [
      item('users', '/gebruikers', { perm: 'users.view' }),
      // Leden van de kring dit academiejaar, met de ereleden en de alumni als
      // tabbladen. Boven Posten omdat het de bredere groep is: elk
      // praesidiumlid is lid, lang niet elk lid heeft een post. Wie enkel de
      // alumni beheert, komt via /admin/leden op dat tabblad terecht.
      item('leden', '/leden', { anyPerm: ['leden.manage', 'alumni.manage'] }),
      // Alumni is een adresboek per lichting, geen opt-in mailinglijst: een
      // afgestudeerde geeft per definitie nooit meer een studiebevestiging van
      // dit werkingsjaar. Daarom bij Leden en niet bij Communicatie.
      item('alumni', '/alumni', { perm: 'alumni.manage', hidden: true }),
      // Posten, werkgroepen, jaarwerkingen en de kiesploeg: één module met vier
      // tabbladen. De key blijft `groups`, zodat een bestaande pin blijft staan.
      item('groups', '/groepen', { posten: true }),
      item('werkgroepen', '/werkgroepen', { werkgroep: true, hidden: true }),
      item('jaarwerkingen', '/jaarwerkingen', { jaarwerking: true, hidden: true }),
      item('kiesploeg', '/kiesploeg', { perm: 'kiesploeg.manage', hidden: true }),
      // Direct onder Posten: dezelfde posten, maar gelezen als "bij wie moet ik
      // zijn voor X". Zichtbaar voor elk praesidiumlid, niet enkel voor beheer.
      item('tasks', '/wie-doet-wat', { anyPerm: ['tasks.view', 'tasks.manageOwn', 'tasks.manage'] }),
      // Ook over het praesidium zelf: wie hoeveel shiften opnam op de lijsten
      // van de grote evenementen en op /shift. Werk van de vice.
      item('praesidiumShifts', '/shiftenoverzicht', { perm: 'shift.praesidium' }),
      item('roles', '/roles', { perm: 'roles.manage' }),
    ]),
    // Alles wat de kring naar buiten stuurt, en het beeld dat ze publiceert.
    group('communicatie', [
      // Bovenaan: dit is het werk dat binnenkomt. Elke post ziet het item om
      // zijn evenementen aan te vragen; commu ziet er alle aanvragen.
      item('commuRequests', '/commu-aanvragen', { commuRequests: true }),
      // De opt-in nieuwsbrieven naar studenten (export + Brevo). De eigen
      // adressen van de kring (activiteiten@vtk.be) staan onder Google Admin.
      item('mailinglists', '/mailinglijsten', { perm: 'mailinglists.export' }),
      item('appPush', '/app-push', { perm: 'app.push' }),
      // De linkpagina hangt in de bio van de sociale media: dat is het werk van
      // communicatie, niet van wie de website onderhoudt.
      item('linkPage', '/linkpagina', { perm: 'home.edit' }),
      // Fotoalbums hebben één ingang: /admin/media. Daar staat de Immich-galerij,
      // en dat is de enige bron die de publieke mediapagina leest.
      item('media', '/media', { anyPerm: ['media.manage', 'photos.manageAlbums'] }),
      // Verzoeken om een foto uit de galerij te halen: een tabblad van Media,
      // dus niet nog eens in de lijst. Alleen `media.manage`, want dit is de
      // enige tab die foto's echt weggooit.
      item('takedowns', '/media/verwijderverzoeken', { perm: 'media.manage', hidden: true }),
    ]),
    // Wat VTK Onderwijs beheert hangt samen: de POC's zijn de studenten die de
    // opleiding vertegenwoordigen, het bureau is hun vergadering, en de
    // lesbezoeken en PAL+ lopen via dezelfde post.
    group('onderwijs', [
      item('pocs', '/pocs', { perm: 'pocs.manage' }),
      item('polls', '/peilingen', { pocRep: true }),
      item('bureau', '/bureau', { perm: 'bureau.manage' }),
      item('lesbezoeken', '/lesbezoeken', {
        anyPerm: ['lesbezoeken.view', 'lesbezoeken.manage'],
      }),
      item('palPlus', '/pal-plus', { perm: 'pal.manage' }),
    ]),

    // ---------------------------------------------------------------------------
    // Losse modules: elk van één post, of van iedereen. Onderling alfabetisch,
    // met Theokot als groep omdat het er twee zijn.
    // ---------------------------------------------------------------------------
    ...loose,

    // IT is vier items: de deur, de kluis en SSO hebben elk een eigen
    // beheerder, en de rest (configuratie, storage, de logboeken, het
    // autorisatievoorbeeld, mails & schermen, de 24UL-app) zijn tabbladen onder
    // het item IT. Die tabbladen staan hier als `hidden`: zoeken vindt ze nog,
    // en een pin erop (het adminlogboek) blijft staan.
    group('it', [
      item('door', '/deur', { perm: 'door.manage' }),
      item('vaultAdmin', '/wachtwoorden/beheer', { perm: 'vault.manage' }),
      item('sso', '/sso', { perm: 'oauth.client.edit' }),
      // Wie geen superadmin is maar wel een van de tabbladen mag zien, wordt
      // door /admin/it naar dat tabblad gestuurd.
      item('itModule', '/it', { anyPerm: ['audit.view', 'urenloopApp.manage'] }),
      // `exact`, anders zou Configuratie (/admin/it) ook oplichten in de pins
      // en het zoeken wanneer je op een ander tabblad van IT staat.
      item('itConfig', '/it', { superAdminOnly: true, exact: true, hidden: true }),
      item('storage', '/it/storage', { superAdminOnly: true, hidden: true }),
      item('auditLog', '/it/logboek', { perm: 'audit.view', hidden: true }),
      item('emailLog', '/it/email-logboek', { superAdminOnly: true, hidden: true }),
      item('authorizationPreview', '/it/preview', { superAdminOnly: true, hidden: true }),
      // Alles wat je op de site zelf niet te zien krijgt: de onboarding en de
      // jaarlijkse bevestiging (die zie je maar één keer) en elke mail die de
      // site opstelt.
      item('flowPreview', '/it/flows', { superAdminOnly: true, hidden: true }),
      item('urenloopApp', '/it/24ul-app', { perm: 'urenloopApp.manage', hidden: true }),
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
