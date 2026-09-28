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
