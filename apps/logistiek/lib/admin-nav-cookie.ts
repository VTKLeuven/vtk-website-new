/**
 * Cookie met de ingeklapte beheerzijbalk. Een cookie en geen `localStorage`: de
 * beheerlayout leest hem op de server, zodat een ingeklapte zijbalk ook
 * ingeklapt binnenkomt. Met `localStorage` verscheen de zijbalk bij elke
 * paginalading eerst open en klapte ze daarna dicht.
 *
 * Een eigen naam en niet die van vtk.be (`vtk-admin-nav-collapsed`): lokaal
 * draaien beide apps op localhost, en cookies trekken zich niets aan van de
 * poort. Dichtklappen in de ene admin klapte dan ook de andere dicht.
 *
 * Staat los van `beheer-nav.tsx`: een constante uit een `'use client'`-bestand
 * komt in een server component niet als string binnen.
 */
export const ADMIN_NAV_COLLAPSED_COOKIE = 'logistiek-admin-nav-collapsed';
