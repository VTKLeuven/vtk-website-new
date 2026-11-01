/**
 * Cookie met de ingeklapte adminzijbalk. Een cookie en geen kolom in de
 * databank: de admin-layout leest hem op de server, zodat een ingeklapte
 * zijbalk ook ingeklapt binnenkomt en niet eerst uitgeklapt verschijnt. Dat het
 * per browser is en niet per account, is de bedoeling: op een groot scherm is
 * er plaats genoeg, op een laptop niet.
 *
 * Staat los van `AdminNav.tsx`: een constante uit een `'use client'`-bestand
 * komt in een server component niet als string binnen.
 */
export const ADMIN_NAV_COLLAPSED_COOKIE = "vtk-admin-nav-collapsed";

/**
 * Cookie met de compacte stand van de admin (de knop naast de inklapknop).
 * Om dezelfde reden een cookie: de layout zet `data-density` al op de server,
 * dus een compacte pagina komt compact binnen. En ook per browser: compact is
 * voor een laptop, op een groot scherm hoeft het niet aan.
 */
export const ADMIN_DENSITY_COOKIE = "vtk-admin-density";
