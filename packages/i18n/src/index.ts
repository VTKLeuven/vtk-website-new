import nl from "./messages/nl.json";
import en from "./messages/en.json";

export const LOCALES = ["nl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "nl";

export const dictionaries = { nl, en } as const;

export type Dictionary = typeof nl;

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return (dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]) as Dictionary;
}

// Pick a translated field from a pair of columns (titleNl/titleEn).
export function pick<T>(nlValue: T, enValue: T | null | undefined, locale: Locale): T {
  if (locale === "en" && enValue !== null && enValue !== undefined && enValue !== "") {
    return enValue as T;
  }
  return nlValue;
}
