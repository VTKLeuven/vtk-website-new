import { useRouter, useSegments } from 'expo-router';
import { useMemo } from 'react';

/**
 * Navigeren binnen de tab waar je staat.
 *
 * **Waarom dit bestaat.** Terugvegen vanaf de linkerrand popt een stack, en een
 * stack kan enkel poppen als er een scherm onder ligt. Ligt daar niets, dan
 * gebeurt er niets; het maakt niet uit welke opties je op de navigator zet. Dus
 * moet elk scherm dat je opent bovenop het tabscherm komen waar je vandaan kwam,
 * en heeft elke tab zijn eigen stack met zijn eigen kopie van de schermen die je
 * er kan bereiken: `/evenement/3` onder Home, `/kalender/evenement/3` onder
 * Kalender. Eén scherm in `src/screens/`, twee adressen.
 *
 * Daarmee vallen de twee eisen samen die eerder tegen elkaar in werkten: de
 * tabbalk blijft staan (alles zit binnen `(tabs)`), en teruggaan brengt je altijd
 * terug waar je vandaan kwam, met de knop én met de veeg, omdat het letterlijk
 * hetzelfde scherm is dat eronder ligt.
 *
 * Dit bestand is de enige plek waar dat vastligt. `scripts/genereer-routes.mjs`
 * schrijft `app/(tabs)/**` uit `TAB_ROUTES`, zodat de kaart en de bestanden niet
 * uit elkaar kunnen groeien.
 */

/**
 * Welke schermen in welke tab bereikbaar zijn.
 *
 * Een tab draagt wat je er ook echt kan openen, en **alles** wat je er kan openen.
 * Dat tweede is waar het één keer op mislukte: de snelkoppeling naar de piano
 * stond op Home terwijl enkel Meer dat scherm droeg, dus opende ze op Meer en
 * zette teruggaan je daar af. `npm run routes:check` loopt nu elke tab af en
 * eist die volledigheid.
 *
 * Het omgekeerde blijft ook waar: een tab draagt niet wat je er niet kan openen.
 * Kalender heeft geen foto's, want er staat nergens in de kalender een knop
 * ernaartoe.
 *
 * `[x]` is een parameter, zoals in de bestandsnamen van expo-router.
 */
export const TAB_ROUTES = {
  '(home)': [
    'lokalen',
    'evenement/[id]',
    'ticket/[slug]',
    'mijn-tickets',
    'bonnetjes',
    'scannen',
    'scan/[eventId]',
    'meldingen',
    'shiften',
    'media',
    'albums',
    'album/[slug]',
    'piano',
    'broodjes',
    'bestellen',
  ],
  kalender: ['evenement/[id]', 'ticket/[slug]', 'mijn-tickets', 'meldingen'],
  studeren: ['studiegroep/[id]', 'studiegroep/nieuw', 'lokalen'],
  tickets: ['ticket/[slug]', 'mijn-tickets', 'scannen', 'scan/[eventId]'],
  meer: [
    'zoeken',
    'lokalen',
    'media',
    'albums',
    'album/[slug]',
    'praesidium',
    'werkgroepen',
    'pocs',
    'piano',
    'shiften',
    'profiel',
    'bonnetjes',
    'meldingen',
    'scannen',
    'scan/[eventId]',
    'categorie/[slug]',
    'pagina/[slug]',
    'evenement/[id]',
    'ticket/[slug]',
    'mijn-tickets',
    'broodjes',
  ],
} as const;

/** Het scherm uit `src/screens/` dat onderaan elke stack ligt. */
export const TAB_INDEX_SCREENS = {
  '(home)': 'tab-index',
  kalender: 'tab-kalender',
  studeren: 'tab-studeren',
  tickets: 'tab-tickets',
  meer: 'meer',
} as const;

export type TabName = keyof typeof TAB_ROUTES;

/**
 * De volgorde waarin een adres een tab krijgt toegewezen wanneer het er in de
 * huidige tab geen is. Home eerst: dat is waar iemand terechtkomt die van buiten
 * de app binnenkomt.
 */
const TAB_ORDER: TabName[] = ['(home)', 'kalender', 'studeren', 'tickets', 'meer'];

/** Home is een routegroep en staat dus niet in het adres. */
const PREFIX: Record<TabName, string> = {
  '(home)': '',
  kalender: '/kalender',
  studeren: '/studeren',
  tickets: '/tickets',
  meer: '/meer',
};

/** Een adres dat op zichzelf al een tab is: `/tickets?tab=mijne`, `/kalender`. */
function isTabRoot(first: string): first is TabName {
  return first in PREFIX && first !== '(home)';
}

/** Past `evenement/[id]` op `evenement/12`? */
function matches(pattern: string, segments: string[]): boolean {
  const parts = pattern.split('/');
  if (parts.length !== segments.length) return false;
  return parts.every((part, i) => part.startsWith('[') || part === segments[i]);
}

/** In welke tab hoort dit adres? `null` als het geen tabscherm is. */
function tabFor(segments: string[], current: TabName): TabName | null {
  const patterns = TAB_ROUTES[current] as readonly string[];
  if (patterns.some((p) => matches(p, segments))) return current;
  return (
    TAB_ORDER.find((tab) => (TAB_ROUTES[tab] as readonly string[]).some((p) => matches(p, segments))) ??
    null
  );
}

/**
 * Zet een adres om naar het adres binnen de juiste tab.
 *
 * Wat er **niet** verandert: de modals aan de wortel (`/inloggen`,
 * `/instellingen`, `/poort`) en een adres dat al een tab noemt. Die eerste horen
 * bewust buiten de tabs: ze schuiven over de app heen in plaats van erin, en
 * teruggaan is ze wegvegen naar beneden.
 */
export function resolveTabHref(path: string, current: TabName): string {
  if (!path.startsWith('/')) return path;

  const [pathname, query] = path.split('?');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return path;
  if (isTabRoot(segments[0])) return path;

  const tab = tabFor(segments, current);
  if (!tab) return path;
  return `${PREFIX[tab]}/${segments.join('/')}${query ? `?${query}` : ''}`;
}

/** De tab waarin het scherm staat dat dit aanroept. */
export function useCurrentTab(): TabName {
  const segments = useSegments();
  const found = segments.find((segment): segment is TabName => segment in PREFIX);
  return found ?? '(home)';
}

/**
 * De router, maar dan een die binnen je tab blijft.
 *
 * Gebruik deze overal in plaats van `useRouter`. De adressen in de schermen
 * blijven gewoon `/piano` en `` `/evenement/${id}` ``; welke tab daarvoor staat,
 * hoort een knop niet te weten. Een nieuw scherm hoeft enkel in `TAB_ROUTES` te
 * staan.
 */
export function useTabRouter() {
  const router = useRouter();
  const tab = useCurrentTab();

  return useMemo(() => {
    /**
     * Een adres is een string of een `{ pathname, params }`-paar. Dat tweede is
     * nodig zodra er een querystring bij hoort: geef je die als één string mee,
     * dan komt het vraagteken in het pad terecht en vindt de router niets.
     */
    const resolve = (target: TabTarget): TabTarget =>
      typeof target === 'string'
        ? resolveTabHref(target, tab)
        : { ...target, pathname: resolveTabHref(target.pathname, tab) };

    return {
      ...router,
      push: (target: TabTarget) => router.push(resolve(target) as never),
      replace: (target: TabTarget) => router.replace(resolve(target) as never),
      navigate: (target: TabTarget) => router.navigate(resolve(target) as never),
    };
  }, [router, tab]);
}

/** Waar een knop naartoe wijst: een pad, of een pad met parameters. */
export type TabTarget = string | { pathname: string; params?: Record<string, unknown> };
