export type GroupSeed = {
  // Vrije, unieke postcode (was de `GroupCode`-enum). Nu een gewone string zodat
  // posten via de GUI toegevoegd/gewijzigd kunnen worden.
  code: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  orderInPraesidium: number;
  // Werkgroepen zetten dit op "WERKGROEP"; praesidiumposten laten het weg
  // (default in de DB is PRAESIDIUM).
  type?: "WERKGROEP";
  descriptionNl?: string;
  descriptionEn?: string;
  website?: string;
};

export const GROUP_SEEDS: GroupSeed[] = [
  { code: "GROEP5", slug: "groep-5", nameNl: "Groep 5", nameEn: "Group 5", orderInPraesidium: 1 },
  { code: "ACTIVITEITEN", slug: "activiteiten", nameNl: "Activiteiten", nameEn: "Activities", orderInPraesidium: 2 },
  { code: "BEDRIJVENRELATIES", slug: "bedrijvenrelaties", nameNl: "Bedrijvenrelaties", nameEn: "Corporate Relations", orderInPraesidium: 3 },
  { code: "COMMUNICATIE", slug: "communicatie", nameNl: "Communicatie", nameEn: "Communications", orderInPraesidium: 4 },
  { code: "CULTUUR", slug: "cultuur", nameNl: "Cultuur", nameEn: "Culture", orderInPraesidium: 5 },
  { code: "CURSUSDIENST", slug: "cursusdienst", nameNl: "Cursusdienst", nameEn: "Course Shop", orderInPraesidium: 6 },
  { code: "DEVELOPMENT", slug: "development", nameNl: "Development", nameEn: "Development", orderInPraesidium: 7 },
  { code: "FAKBAR", slug: "fakbar", nameNl: "Fakbar", nameEn: "Fakbar", orderInPraesidium: 8 },
  { code: "INTERNATIONAAL", slug: "internationaal", nameNl: "Internationaal", nameEn: "International", orderInPraesidium: 9 },
  { code: "IT", slug: "it", nameNl: "IT", nameEn: "IT", orderInPraesidium: 10 },
  { code: "LOGISTIEK", slug: "logistiek", nameNl: "Logistiek", nameEn: "Logistics", orderInPraesidium: 11 },
  { code: "ONDERWIJS", slug: "onderwijs", nameNl: "Onderwijs", nameEn: "Education", orderInPraesidium: 12 },
  { code: "ONTHAAL", slug: "onthaal", nameNl: "Onthaal", nameEn: "Welcome", orderInPraesidium: 13 },
  { code: "SPORT", slug: "sport", nameNl: "Sport", nameEn: "Sports", orderInPraesidium: 14 },
  { code: "THEOKOT", slug: "theokot", nameNl: "Theokot", nameEn: "Theokot", orderInPraesidium: 15 },
];

/**
 * De werkgroepen. Ze delen het `Group`-model (leden + rollen per werkingsjaar)
 * met de praesidiumposten, maar staan niet op /praesidium: ze krijgen
 * /werkgroepen met hun eigen infotekst en optionele website. `orderInPraesidium`
 * dient hier gewoon als volgorde op die pagina.
 */
export const WERKGROEP_SEEDS: GroupSeed[] = [
  {
    code: "BEST",
    slug: "best",
    nameNl: "BEST",
    nameEn: "BEST",
    orderInPraesidium: 1,
    type: "WERKGROEP",
    descriptionNl:
      "BEST (Board of European Students of Technology) is een internationale organisatie bestaande uit technische, wetenschappelijke en ingenieursstudenten aan 96 universiteiten in 34 Europese landen. We organiseren academische competities, soft-skills workshops en internationale cursussen.",
    descriptionEn:
      "BEST (Board of European Students of Technology) is an international organisation of technology and engineering students across 96 universities in 34 European countries. We organise academic competitions, soft skills workshops and international engineering courses.",
    website: "https://best.eu.org",
  },
  {
    code: "BIOMEDIX",
    slug: "biomedix",
    nameNl: "Biomedix",
    nameEn: "Biomedix",
    orderInPraesidium: 2,
    type: "WERKGROEP",
    descriptionNl:
      "Biomedix is de werkgroep binnen VTK speciaal voor studenten Biomedische Technologie en iedereen met interesse in medische technologie en innovatie. We organiseren workshops, netwerkevents, bedrijfsbezoeken en het jaarlijkse Biomedical Dinner.",
    descriptionEn:
      "Biomedix is the working group within VTK for Biomedical Engineering students and anyone passionate about medical technology and healthcare innovation. We host workshops, networking events, company visits and the annual Biomedical Dinner.",
    website: "https://biomedix.vtk.be",
  },
  {
    code: "CHEMIX",
    slug: "chemix",
    nameNl: "Chemix",
    nameEn: "Chemix",
    orderInPraesidium: 3,
    type: "WERKGROEP",
    descriptionNl:
      "Chemix is het studententeam dat evenementen organiseert voor studenten met een passie voor Chemische Ingenieurstechnieken (CIT). We organiseren ludieke activiteiten, educatieve workshops en professionele events in samenwerking met chemische bedrijven.",
    descriptionEn:
      "Chemix organizes events for students with a passion for Chemical Engineering (CIT). We offer a mix of social gatherings, educational workshops and professional networking events with leading chemical companies.",
    website: "https://chemix.vtk.be",
  },
  {
    code: "EXISTENZ",
    slug: "existenz",
    nameNl: "Existenz",
    nameEn: "Existenz",
    orderInPraesidium: 4,
    type: "WERKGROEP",
    descriptionNl:
      "Existenz is een gedreven collectief van studenten burgerlijk ingenieur-architect aan de KU Leuven. Existenz verbindt architectuurtheorie met de praktijk, artistieke creativiteit met techniek, met als jaarlijks hoogtepunt het tijdelijk transformeren van een leegstaand Leuvens pand tijdens de befaamde Existenzweek.",
    descriptionEn:
      "Existenz is a collective of engineering-architecture students at KU Leuven. Existenz bridges architectural theory and engineering practice, culminating every year in the transformation of an abandoned Leuven building during the renowned Existenz Week.",
    website: "https://existenz.be",
  },
  {
    code: "MECHANIX",
    slug: "mechanix",
    nameNl: "Mechanix",
    nameEn: "Mechanix",
    orderInPraesidium: 5,
    type: "WERKGROEP",
    descriptionNl:
      "Mechanix is de werkgroep binnen VTK voor alles wat met werktuigkunde en mechanica te maken heeft. We organiseren lezingen, praktische workshops, bedrijfsbezoeken en ontspannende activiteiten voor ingenieursstudenten.",
    descriptionEn:
      "Mechanix is the VTK working group for everything related to mechanical engineering. We organise lectures, hands-on workshops, company visits and social activities for engineering students.",
    website: "https://mechanix.vtk.be",
  },
  {
    code: "REVUE",
    slug: "revue",
    nameNl: "Revue",
    nameEn: "Revue",
    orderInPraesidium: 6,
    type: "WERKGROEP",
    descriptionNl:
      "Al meer dan 50 jaar brengt de VTK Revue een groots avondvullend satirisch theaterspektakel met live muziek, dans, humor en zelfgemaakte decors en kostuums waarin professoren en het ingenieursleven liefdevol op de korrel worden genomen.",
    descriptionEn:
      "For over 50 years, the VTK Revue has staged a full-length satirical theater spectacle complete with live music, dancing, humor, custom stage sets and costumes poking fun at engineering professors and student life.",
    website: "https://revue.vtk.be",
  },
  {
    code: "STATIX",
    slug: "statix",
    nameNl: "Statix",
    nameEn: "Statix",
    orderInPraesidium: 7,
    type: "WERKGROEP",
    descriptionNl:
      "Statix is de studentenvereniging en werkgroep voor studenten burgerlijk ingenieur bouwkunde aan de KU Leuven. We slaan de brug tussen theorie en bouwpraktijk via werfbezoeken, gastlezingen, workshops en bedrijfscases.",
    descriptionEn:
      "Statix is the student association and working group for civil engineering students at KU Leuven. We bridge academic theory and construction practice through site visits, guest lectures, workshops and business cases.",
    website: "https://statixleuven.be",
  },
];

/**
 * Standaardtabs voor de hoofdnavigatie. Dit is zowel de seed als de fallback
 * zolang de `HeaderTab`-tabel leeg is. `intro*` en `cta*` vullen de
 * categoriepagina (`/[headerSlug]`); ze zijn nadien bewerkbaar via /admin/inhoud.
 */
export const HEADER_TABS: Array<{
  code: string;
  slug: string;
  labelNl: string;
  labelEn: string;
  order: number;
  introNl?: string;
  introEn?: string;
  /** Externe site waar de headerknop naartoe gaat in plaats van naar /<slug>. */
  externalUrl?: string;
  /**
   * Extra items in het uitklapmenu van deze tab. Voor werkingen met een eigen
   * site: daar hangen geen pagina's onder deze tab, maar leden moeten er wel
   * naartoe kunnen.
   */
  links?: Array<{ labelNl: string; labelEn: string; url: string }>;
  ctaLabelNl?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
}> = [
  // Code blijft AANBOD: de seed upsert op code, en HeaderTab.code hangt vast aan
  // bestaande Page-rijen. Enkel slug en label verhuizen naar "Info".
  {
    code: "AANBOD",
    slug: "info",
    labelNl: "Info",
    labelEn: "Info",
    order: 0,
    introNl:
      "Praktische diensten, campusvoorzieningen en tools die je semester vlotter maken.",
    introEn:
      "Practical services, campus facilities and tools that make your semester smoother.",
    // De kalender was buiten de homepage enkel via de footer te vinden. Ze staat
    // hier in het menu i.p.v. als twaalfde headertab: elf tabs is al de grens
    // waarop de header naar een menuknop overschakelt (zie CLAUDE.md).
    links: [
      {
        labelNl: "Kalender",
        labelEn: "Calendar",
        url: "/kalender",
      },
      // Intern pad: de pianopagina is een eigen route, geen contentpagina onder
      // deze tab, dus ze komt er niet vanzelf in het uitklapmenu bij.
      { labelNl: "Piano reserveren", labelEn: "Reserve the piano", url: "/piano" },
      // De uitleendienst (apps/logistiek) staat hier bewust NIET als los
      // menu-item. Ze heeft een eigen pagina onder deze tab (/info/uitleendienst)
      // die de voorwaarden uitlegt en met een knop naar de app gaat; een tweede
      // kale link ernaast maakte hetzelfde ding twee keer zichtbaar onder een
      // andere naam.
    ],
  },
  { code: "THEOKOT", slug: "theokot", labelNl: "Theokot", labelEn: "Theokot", order: 1 },
  { code: "SHIFTEN", slug: "shift", labelNl: "Shiften", labelEn: "Shifts", order: 2 },
  { code: "EERSTEJAARS", slug: "eerstejaars", labelNl: "Eerstejaars", labelEn: "Freshmen", order: 3 },
  {
    code: "CAREER",
    slug: "career",
    labelNl: "Career",
    labelEn: "Career",
    order: 4,
    // Career heeft een eigen site; de headerknop gaat er rechtstreeks naartoe
    // in plaats van naar de categoriepagina.
    externalUrl: "https://career.vtk.be",
    links: [
      {
        labelNl: "Jobfair",
        labelEn: "Job fair",
        url: "https://www.career.vtk.be/event/vtk-jobfair",
      },
      {
        labelNl: "Contact voor bedrijven",
        labelEn: "Contact for companies",
        url: "https://www.career.vtk.be/contact",
      },
    ],
    ctaLabelNl: "Meer info op career.vtk.be",
    ctaLabelEn: "More info on career.vtk.be",
    ctaUrl: "https://career.vtk.be",
  },
  {
    code: "CURSUSDIENST",
    slug: "cursusdienst",
    labelNl: "Cursusdienst",
    labelEn: "Course Shop",
    order: 5,
    externalUrl: "https://cudi.vtk.be",
    links: [
      { labelNl: "Bestel boeken", labelEn: "Order books", url: "https://cudi.vtk.be/vtk/shop" },
      { labelNl: "Tweedehands", labelEn: "Second-hand", url: "https://cudi.vtk.be/vtk/secondhand" },
      { labelNl: "Printer", labelEn: "Printer", url: "https://cudi.vtk.be/vtk/printer" },
      { labelNl: "Subsidies", labelEn: "Subsidies", url: "https://cudi.vtk.be/vtk/subsidies" },
    ],
    ctaLabelNl: "Bestel cursussen op cudi.vtk.be",
    ctaLabelEn: "Order courses on cudi.vtk.be",
    ctaUrl: "https://cudi.vtk.be",
  },
  { code: "INTERNATIONAAL", slug: "internationaal", labelNl: "Internationaal", labelEn: "International", order: 6 },
  {
    code: "STUDIES",
    slug: "studies",
    labelNl: "Studies",
    labelEn: "Studies",
    order: 7,
    links: [
      { labelNl: "Burgieclan", labelEn: "Burgieclan", url: "https://burgieclan.vtk.be" },
    ],
  },
  { code: "MEDIA", slug: "media", labelNl: "Media", labelEn: "Media", order: 8 },
  { code: "OVER_VTK", slug: "over-vtk", labelNl: "Over-VTK", labelEn: "About VTK", order: 9 },
  { code: "CONTACT", slug: "contact", labelNl: "Contact", labelEn: "Contact", order: 10 },
];
