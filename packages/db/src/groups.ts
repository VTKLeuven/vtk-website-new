export type GroupSeed = {
  // Vrije, unieke postcode (was de `GroupCode`-enum). Nu een gewone string zodat
  // posten via de GUI toegevoegd/gewijzigd kunnen worden.
  code: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  orderInPraesidium: number;
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
  },
  { code: "THEOKOT", slug: "theokot", labelNl: "Theokot", labelEn: "Theokot", order: 1 },
  { code: "SHIFTEN", slug: "shift", labelNl: "Shiften", labelEn: "Shifts", order: 2 },
  { code: "EERSTEJAARS", slug: "eerstejaars", labelNl: "Eerstejaars", labelEn: "Freshmen", order: 3 },
  { code: "CAREER", slug: "career", labelNl: "Career", labelEn: "Career", order: 4 },
  {
    code: "CURSUSDIENST",
    slug: "cursusdienst",
    labelNl: "Cursusdienst",
    labelEn: "Course Shop",
    order: 5,
    ctaLabelNl: "Bestel cursussen op cudi.vtk.be",
    ctaLabelEn: "Order courses on cudi.vtk.be",
    ctaUrl: "https://cudi.vtk.be",
  },
  { code: "INTERNATIONAAL", slug: "internationaal", labelNl: "Internationaal", labelEn: "International", order: 6 },
  { code: "STUDIES", slug: "studies", labelNl: "Studies", labelEn: "Studies", order: 7 },
  { code: "MEDIA", slug: "media", labelNl: "Media", labelEn: "Media", order: 8 },
  { code: "OVER_VTK", slug: "over-vtk", labelNl: "Over-VTK", labelEn: "About VTK", order: 9 },
  { code: "CONTACT", slug: "contact", labelNl: "Contact", labelEn: "Contact", order: 10 },
];
