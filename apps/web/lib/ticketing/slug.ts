/**
 * Maakt van een titel een URL-naam voor een ticketevent.
 *
 * Staat hier en niet in `app/actions/tickets.ts` omdat een `"use server"`-module
 * enkel async functies mag exporteren; de nieuw-pagina wil deze functie ook, om
 * de URL-naam alvast in te vullen wanneer de titel van een gekoppeld
 * kalenderevent komt en er dus geen titelveld meer op het scherm staat.
 *
 * De implementatie staat in `@vtk/db/slug`, samen met die van de
 * kalenderevents: de seed maakt dezelfde slugs en kan niets uit `apps/web`
 * importeren.
 */
export { slugify } from "@vtk/db/slug";
