/**
 * Maakt van een titel een URL-naam voor een ticketevent.
 *
 * Staat hier en niet in `app/actions/tickets.ts` omdat een `"use server"`-module
 * enkel async functies mag exporteren; de nieuw-pagina wil deze functie ook, om
 * de URL-naam alvast in te vullen wanneer de titel van een gekoppeld
 * kalenderevent komt en er dus geen titelveld meer op het scherm staat.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
