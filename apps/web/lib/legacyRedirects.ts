/**
 * De adressen van de oude vtk.be en waar ze op deze site terechtkomen.
 *
 * De oude site zette alles onder een taalvoorvoegsel met afsluitende slash:
 * `/nl/page/<slug>/`, `/nl/category/<Categorie>/`, `/nl/calendar/`, enzovoort,
 * telkens met een `/en/`-tegenhanger. Die links staan in zoekmachines, in mails
 * en op de sites van bevriende kringen, dus ze moeten blijven werken.
 *
 * Deze map staat bewust hier en niet in `next.config.ts`: een lijst in de config
 * is niet te testen, en het gaat om precies het soort tabel waar een typfout
 * stil een 404 oplevert. `redirects()` in de config rolt ze enkel uit.
 *
 * Twee dingen om in het oog te houden:
 *
 * 1. Nederlands leeft op deze site zonder voorvoegsel (`/kalender`), Engels
 *    onder `/en/...`. Een oude `/nl/...`-URL moet dus naar de voorvoegselloze
 *    vorm, niet naar zichzelf; anders houden we de duplicate content in stand
 *    die de canonicals net wegwerken.
 * 2. `proxy.ts` rewrit een voorvoegselloos pad intern naar `/nl/...`. Dat is een
 *    rewrite en geen redirect, en redirects uit de config draaien vóór de proxy,
 *    dus `/nl/shift` -> `/shift` -> (intern) `/nl/shift` levert geen ping-pong op.
 *    Ze eindigt bij de eerste hop in de adresbalk van de bezoeker.
 */

export type LegacyRedirect = {
  /** Padpatroon zoals Next het matcht (path-to-regexp). */
  source: string;
  /** Voorvoegselloos NL-pad, een `/en/...`-pad, of een volledige externe URL. */
  destination: string;
  /** `true` wordt een 308, `false` een 307. */
  permanent: boolean;
};

/** De taalvoorvoegsels die de oude site in elke URL zette. */
export const LEGACY_LOCALES = ['nl', 'en'] as const;

export type LegacyLocale = (typeof LEGACY_LOCALES)[number];

/**
 * De acht categorieën uit de navigatie van de oude site, met de headertab waar
 * ze nu onder vallen. De sleutel is de schrijfwijze zoals ze in de oude URL's
 * staat; die is hoofdlettergevoelig.
 */
export const LEGACY_CATEGORIES: Record<string, string> = {
  Aanbod: '/info',
  Career: '/career',
  Cursusdienst: '/cursusdienst',
  Eerstejaars: '/eerstejaars',
  Internationaal: '/internationaal',
  Media: '/media',
  'Over-VTK': '/over-vtk',
  Studies: '/studies',
};

/** Waar Nederlands landt: op de root. Engels houdt zijn voorvoegsel. */
function prefix(locale: LegacyLocale): string {
  return locale === 'en' ? '/en' : '';
}

/**
 * De oude URL's dragen de categorienaam met hoofdletter (`/category/Aanbod/`),
 * maar er circuleren ook kleingeschreven varianten. Vang beide vormen in één
 * regel in plaats van de tabel te verdubbelen.
 */
function categorySource(locale: LegacyLocale, name: string): string {
  const lower = name.toLowerCase();
  const forms = lower === name ? name : `${name}|${lower}`;
  return `/${locale}/category/:cat(${forms})`;
}

function redirectsForLocale(locale: LegacyLocale): LegacyRedirect[] {
  const to = prefix(locale);

  return [
    // Infopagina's. De slugs zijn ongewijzigd meeverhuisd, dus dit is één
    // patroon en geen tabel van 59 regels.
    { source: `/${locale}/page/:slug`, destination: `${to}/p/:slug`, permanent: true },

    // Categoriepagina's -> de headertab die de rubriek overnam.
    ...Object.entries(LEGACY_CATEGORIES).map(([name, target]) => ({
      source: categorySource(locale, name),
      destination: `${to}${target}`,
      permanent: true,
    })),

    // De oude kalender had per evenement een `<datum>_<slug>`-URL. Die slugs zijn
    // niet meegemigreerd, dus alles landt op het overzicht in plaats van op een
    // 404. Daarom tijdelijk: zodra de evenementen een stabiele oude sleutel
    // hebben, kan dit naar de detailpagina wijzen.
    { source: `/${locale}/calendar/view/:rest*`, destination: `${to}/kalender`, permanent: false },
    { source: `/${locale}/calendar`, destination: `${to}/kalender`, permanent: true },

    // Shiften heette vroeger registration-shift.
    { source: `/${locale}/registration-shift`, destination: `${to}/shift`, permanent: true },

    // Bedrijvenrelaties draait op een eigen site.
    { source: `/${locale}/corporate`, destination: 'https://career.vtk.be', permanent: true },

    // Cursusdienst idem. De winkel is de tegenhanger van het oude `retail`; voor
    // de rest van de oude cudi-paden bestaat geen één-op-één-pagina, dus die
    // gaan tijdelijk naar de startpagina van de webshop.
    { source: `/${locale}/cudi/retail`, destination: 'https://cudi.vtk.be/vtk/shop', permanent: false },
    { source: `/${locale}/cudi/:path*`, destination: 'https://cudi.vtk.be', permanent: false },
  ];
}

/**
 * Paden die op deze site dezelfde naam houden, maar hun `/nl`-voorvoegsel
 * kwijtmoeten. `/en/privacy` staat hier niet bij: dat adres is op deze site al
 * het juiste, en een regel ernaartoe zou naar zichzelf wijzen.
 */
const NL_PREFIXED_PATHS = ['privacy', 'shift', 'contact'] as const;

/** De volledige map, in de volgorde waarin Next ze moet proberen. */
export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  ...LEGACY_LOCALES.flatMap(redirectsForLocale),
  ...NL_PREFIXED_PATHS.map((path) => ({
    source: `/nl/${path}`,
    destination: `/${path}`,
    permanent: true,
  })),
];
