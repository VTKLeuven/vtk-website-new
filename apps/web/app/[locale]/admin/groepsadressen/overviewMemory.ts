"use client";

import { useSyncExternalStore } from "react";

/**
 * Waar het overzicht stond (filter, zoekterm, open categorieën), zodat de link
 * "Groepsadressen" op een adres terugkeert naar precies die lijst en niet naar
 * een lijst met alles dicht. Per tabblad (`sessionStorage`); zonder opslag
 * (privévenster, geblokkeerd) gewoon het kale overzicht.
 */
const KEY = "vtk.groepsadressen.overzicht";

export function rememberOverview(url: string) {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    /* zonder opslag: de link gaat naar het kale overzicht */
  }
}

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** De laatst bekeken lijst, of `fallback` op de server en zonder opslag. */
export function useOverviewHref(fallback: string): string {
  const stored = useSyncExternalStore(
    () => () => {},
    read,
    () => null,
  );
  // Enkel een pad onder hetzelfde overzicht, nooit iets anders uit de opslag.
  return stored && stored.startsWith(`${fallback}`) && !stored.startsWith(`${fallback}/`) ? stored : fallback;
}
