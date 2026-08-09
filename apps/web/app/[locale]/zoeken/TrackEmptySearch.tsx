"use client";

import { useEffect } from "react";
import { trackEmptySearch } from "@/lib/analytics-client";

/**
 * Meldt aan Umami dat deze zoekopdracht niets opleverde.
 *
 * Dat de bezoeker gezocht heeft, staat al in het adres (`/zoeken?q=...`), maar
 * daaruit valt niet af te lezen of het iets opleverde. En dat is net het
 * bruikbare signaal: veertig keer gezocht op iets dat nul resultaten geeft,
 * betekent dat er inhoud ontbreekt of dat ze anders heet dan mensen denken.
 *
 * Als component en niet als aanroep in de pagina, want de pagina rendert op de
 * server. `useEffect` met de zoekterm als afhankelijkheid stuurt bij elke nieuwe
 * mislukte zoekopdracht precies één melding.
 */
export function TrackEmptySearch({ query }: { query: string }) {
  useEffect(() => {
    if (!query) return;
    trackEmptySearch(query);
  }, [query]);

  return null;
}
