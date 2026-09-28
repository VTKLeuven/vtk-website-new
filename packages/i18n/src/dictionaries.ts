import nl from "./messages/nl.json";
import en from "./messages/en.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/*
 * De woordenboeken staan in een eigen module, los van `LOCALES` en `pick`.
 * Samen met `"sideEffects": false` in package.json laat dat de bundler deze
 * module weg bij een clientcomponent die enkel `pick` of `LOCALES` gebruikt.
 * Stonden ze in index.ts, dan kwamen beide JSON-bestanden (samen ~40 KB gzip)
 * mee in de bundel van elke pagina.
 */

export const dictionaries = { nl, en } as const;

export type Dictionary = typeof nl;

export function getDictionary(locale: Locale): Dictionary {
  return (dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]) as Dictionary;
}
