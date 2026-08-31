/**
 * Fallbacks voor de aanbod-kaarten in de homepage-sectie "Wat we doen".
 *
 * Beheerders zetten per tab een eigen foto en een eigen tekstje via /admin/home
 * (HeaderTab.imageKey, HeaderTab.homeBodyNl/En); wat hier staat, geldt enkel
 * zolang een tab dat niet heeft. Slugs zonder foto vallen terug op het
 * gestreepte placeholder-patroon.
 *
 * Staat hier en niet in HomeEditorial omdat /admin/home hetzelfde nodig heeft:
 * het beheerscherm toont in de preview en in de placeholder wat de homepage
 * zou tonen. Leefde dit enkel bij de homepage, dan beloofde de admin een
 * "standaardfoto" en een standaardtekst die ze niet kon laten zien.
 */
export const AANBOD_PHOTOS: Record<string, string> = {
  theokot: "/aanbod/theokot.jpg",
  cursusdienst: "/aanbod/cursusdienst.jpg",
  onderwijs: "/aanbod/onderwijs.jpg",
  sport: "/aanbod/sport.jpg",
  internationaal: "/aanbod/internationaal.jpg",
  career: "/career-fair.jpg",
  skireis: "/aanbod/skireis.jpg",
  activiteiten: "/aanbod/skireis.jpg",
};

/** De zin onder de titel zolang een werking er zelf geen schreef. */
export const AANBOD_DEFAULT_BODY_NL =
  "Ontdek pagina's, activiteiten en praktische info van deze werking.";
export const AANBOD_DEFAULT_BODY_EN =
  "Discover pages, activities and practical information from this work group.";

/**
 * Wat er onder de titel van een aanbod-kaart komt te staan.
 *
 * Schreef een redacteur zelf iets (via /admin/home), dan telt dat; anders
 * krijgt elke werking dezelfde standaardzin. Vult hij enkel het Nederlands in,
 * dan valt de Engelse kaart via `pick` op die Nederlandse tekst terug in plaats
 * van op de algemene Engelse zin: de eigen tekst zegt meer, ook in de verkeerde
 * taal.
 */
export function aanbodCardBody(
  homeBodyNl: string | null | undefined,
  homeBodyEn: string | null | undefined,
): { bodyNl: string; bodyEn: string } {
  const nl = homeBodyNl?.trim() ?? "";
  const en = homeBodyEn?.trim() ?? "";
  if (nl === "" && en === "") {
    return { bodyNl: AANBOD_DEFAULT_BODY_NL, bodyEn: AANBOD_DEFAULT_BODY_EN };
  }
  return { bodyNl: nl || en, bodyEn: en };
}
