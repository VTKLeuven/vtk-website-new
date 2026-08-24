/**
 * Vaste, ingebouwde routes van de website.
 *
 * Deze pagina's zijn geen CMS-pagina's in de `Page`-tabel, maar volwaardige
 * Next.js routes (/werkgroepen, /kalender, /praesidium, enz.). In /admin/inhoud
 * kunnen beheerders ze via HeaderTabLink toevoegen aan een categorie, zodat ze
 * in het uitklapmenu én op de categoriepagina (/info, /over-vtk, ...) verschijnen.
 */

export type BuiltinRoute = {
  path: string;
  labelNl: string;
  labelEn: string;
  descriptionNl: string;
  descriptionEn: string;
};

export const BUILTIN_ROUTES: BuiltinRoute[] = [
  {
    path: "/kalender",
    labelNl: "Kalender",
    labelEn: "Calendar",
    descriptionNl: "Alle activiteiten van VTK: feestjes, cantussen, sport en cultuur.",
    descriptionEn: "All VTK activities: parties, cantuses, sports and culture.",
  },
  {
    path: "/werkgroepen",
    labelNl: "Werkgroepen",
    labelEn: "Working groups",
    descriptionNl: "De werkgroepen van VTK: BEST, Biomedix, Chemix, Existenz, Mechanix.",
    descriptionEn: "VTK working groups: BEST, Biomedix, Chemix, Existenz, Mechanix.",
  },
  {
    path: "/praesidium",
    labelNl: "Praesidium",
    labelEn: "Praesidium",
    descriptionNl: "Het praesidium van VTK, per werkingsjaar.",
    descriptionEn: "The VTK praesidium team by academic year.",
  },
  {
    path: "/piano",
    labelNl: "Piano reserveren",
    labelEn: "Reserve the piano",
    descriptionNl: "Reserveer een tijdslot op de VTK-piano in het Theokot.",
    descriptionEn: "Reserve a time slot on the VTK piano in Theokot.",
  },
  {
    path: "/theokot",
    labelNl: "Theokot & broodjes",
    labelEn: "Theokot & sandwiches",
    descriptionNl: "Openingsuren en broodjes bestellen bij Theokot.",
    descriptionEn: "Opening hours and ordering sandwiches at Theokot.",
  },
  {
    path: "/tickets",
    labelNl: "Tickets",
    labelEn: "Tickets",
    descriptionNl: "Ticketverkoop voor VTK-evenementen.",
    descriptionEn: "Ticket sales for VTK events.",
  },
  {
    path: "/media",
    labelNl: "Media & foto's",
    labelEn: "Media & photos",
    descriptionNl: "Fotoalbums, aftermovies en publicaties.",
    descriptionEn: "Photo albums, aftermovies and publications.",
  },
  {
    path: "/shift",
    labelNl: "Shiften",
    labelEn: "Shifts",
    descriptionNl: "Help mee achter de toog of op een evenement.",
    descriptionEn: "Help out at the bar or events and earn VTK points.",
  },
  {
    path: "/contact",
    labelNl: "Contact",
    labelEn: "Contact",
    descriptionNl: "Contactgegevens, locaties en contactformulier.",
    descriptionEn: "Contact information, locations and contact form.",
  },
  {
    path: "/lesbezoeken",
    labelNl: "Lesbezoeken",
    labelEn: "Class visits",
    descriptionNl: "Informatie over lesbezoeken voor middelbare scholieren.",
    descriptionEn: "Information about class visits for secondary school students.",
  },
  {
    path: "/pocs",
    labelNl: "POC's",
    labelEn: "Student reps (POCs)",
    descriptionNl: "Permanente Onderwijscommissies en studentenvertegenwoordiging.",
    descriptionEn: "Permanent Education Committees and student representatives.",
  },
  {
    path: "/bureau-inschrijving",
    labelNl: "Bureau inschrijving",
    labelEn: "Education Board registration",
    descriptionNl: "Inschrijven voor het eerstvolgende VTK Bureau.",
    descriptionEn: "Register for the upcoming VTK Education Board meeting.",
  },
  {
    path: "/bureau",
    labelNl: "Onderwijsbureau",
    labelEn: "Education Board",
    descriptionNl: "Vergaderingen en verslagen van het Bureau.",
    descriptionEn: "Meetings and reports of the Education Board.",
  },
  {
    path: "/links",
    labelNl: "Links",
    labelEn: "Links",
    descriptionNl: "Verkorte links en officiële kanalen.",
    descriptionEn: "Short links and official channels.",
  },
  {
    path: "/24uur-app",
    labelNl: "24 Urenloop app",
    labelEn: "24 Hours Run app",
    descriptionNl: "Download de 24 Urenloop app.",
    descriptionEn: "Download the 24 Hours Run app.",
  },
];
