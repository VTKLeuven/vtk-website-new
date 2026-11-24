/**
 * Namen voor de schermen en tabs die de app meldt (`AppUsageReport.screens`).
 * De app stuurt het routepatroon uit expo-router ("evenement/[id]") of een
 * tabblad binnen een scherm ("kalender:planning:semester"); hier wordt dat een
 * naam die iemand in het beheer herkent. Een scherm dat hier (nog) niet staat,
 * toont zijn patroon: liever iets lelijks dan iets dat wegvalt.
 */

const SCREENS: Record<string, string> = {
  home: "Home",
  kalender: "Kalender",
  studies: "Studies",
  tickets: "Tickets",
  meer: "Meer",

  "kalender:planning": "Kalender › Planning: week",
  "kalender:planning:vak": "Kalender › Planning: per vak",
  "kalender:planning:semester": "Kalender › Planning: semester",
  "kalender:planning:blok": "Kalender › Planning: blok",
  "kalender:evenementen": "Kalender › Evenementen: lijst",
  "kalender:evenementen:maand": "Kalender › Evenementen: maand",
  "kalender:mijn": "Kalender › Mijn evenementen",
  "studies:blokken": "Studies › Samen blokken",
  "studies:cudi": "Studies › Cursusdienst",
  "studies:burgieclan": "Studies › Burgieclan",
  "tickets:kopen": "Tickets › Kopen",
  "tickets:mijne": "Tickets › Mijn tickets",

  "evenement/[id]": "Evenement",
  "ticket/[slug]": "Ticketpagina",
  "ticket-bestellen/[slug]": "Tickets bestellen",
  "mijn-tickets": "Mijn tickets",
  bonnetjes: "Bonnetjes",
  scannen: "Code scannen",
  deur: "Tickets scannen: event kiezen",
  "scan/[eventId]": "Scanner aan de deur",
  meldingen: "Meldingen",
  shiften: "Shiften",
  media: "Foto's",
  albums: "Albums",
  "album/[slug]": "Album",
  piano: "Piano",
  broodjes: "Broodjes",
  bestellen: "Broodjes bestellen",
  peilingen: "Peilingen",
  alma: "Alma",
  lokalen: "Lokalen",
  "studiegroep/[id]": "Studiegroep",
  "studiegroep/nieuw": "Nieuwe studiegroep",
  "vak/[id]": "Vak op Burgieclan",
  "cudi-bestellingen": "Cursusdienst › Bestellingen",
  "cudi-tijdsloten": "Cursusdienst › Tijdsloten",
  web: "Pagina van vtk.be (beheer, cudi, feedback)",
  zoeken: "Zoeken",
  praesidium: "Praesidium",
  werkgroepen: "Werkgroepen",
  pocs: "POC's",
  profiel: "Profiel",
  "categorie/[slug]": "Categorie",
  "pagina/[slug]": "Pagina uit het CMS",
  beheer: "Beheer",
  vervoer: "Transport",
  inloggen: "Inloggen",
  poort: "Onboarding",
  instellingen: "Serverinstelling",
};

const TABS: Record<string, string> = {
  "(home)": "Home",
  kalender: "Kalender",
  studies: "Studies",
  tickets: "Tickets",
  meer: "Meer",
  "": "Buiten de tabs",
};

export function screenLabel(screen: string): string {
  return SCREENS[screen] ?? screen;
}

export function tabLabel(tab: string): string {
  return TABS[tab] ?? tab;
}
