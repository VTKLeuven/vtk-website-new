"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  SOURCE_URL_PARAMS,
  sourceFromLanding,
  type TicketSource,
} from "@/lib/ticketing/source";

// Eén waarde per pagina: `useSyncExternalStore` wil bij elke lezing hetzelfde
// object terug, en na het opruimen van de adresbalk (hieronder) valt de
// herkomst niet meer uit de URL te lezen.
let cached: { pathname: string; source: TicketSource } | null = null;

function hasSourceParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return SOURCE_URL_PARAMS.some((param) => params.has(param));
}

function snapshot(): TicketSource {
  const { pathname, search, origin } = window.location;
  if (cached && cached.pathname === pathname && !hasSourceParams(search)) return cached.source;
  cached = { pathname, source: sourceFromLanding(search, document.referrer, origin) };
  return cached.source;
}

const subscribe = () => () => {};

/**
 * De herkomst van dit bezoek (zie `lib/ticketing/source.ts`). Null op de
 * server en in de eerste render; daarna de waarde van deze pagina.
 *
 * Haalt de herkomstparameters na het lezen uit de adresbalk. Wie van Facebook
 * kwam en de link kopieert voor een groepschat, zou anders elke koper uit die
 * groepschat aan Facebook toeschrijven. De waarde blijft in het geheugen van
 * deze pagina en reist verder mee in de links die ze maakt; geen cookie en
 * geen storage.
 *
 * `document.referrer` verandert niet bij een navigatie binnen de site. Een
 * interne link zonder `via` erft dus de referrer van het eerste bezoek: dat is
 * hoe de bezoeker op de site kwam, en dat is precies waarom onze eigen links
 * naar een ticketpagina wél een `via` dragen.
 */
export function useLandingSource(): TicketSource | null {
  const source = useSyncExternalStore(subscribe, snapshot, () => null);

  useEffect(() => {
    if (!hasSourceParams(window.location.search)) return;
    const url = new URL(window.location.href);
    for (const param of SOURCE_URL_PARAMS) url.searchParams.delete(param);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [source]);

  return source;
}
