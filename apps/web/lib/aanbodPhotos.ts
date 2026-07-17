/**
 * Fallback-foto per werking op de aanbod-kaarten (fotografie-richting).
 * Beheerders uploaden per tab een eigen foto via /admin/home
 * (HeaderTab.imageKey); deze statische set geldt enkel zolang een tab er geen
 * heeft. Slugs zonder foto vallen terug op het gestreepte placeholder-patroon.
 *
 * Staat hier en niet in HomeEditorial omdat /admin/home dezelfde map nodig heeft:
 * het beheerscherm toont in de preview wat de homepage zou tonen. Leefde de map
 * enkel bij de homepage, dan beloofde de admin een "standaardfoto" die ze niet
 * kon laten zien.
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
