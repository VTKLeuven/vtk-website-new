export const LOCALES = ["nl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "nl";

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// Pick a translated field from a pair of columns (titleNl/titleEn).
export function pick<T>(nlValue: T, enValue: T | null | undefined, locale: Locale): T {
  if (locale === "en" && enValue !== null && enValue !== undefined && enValue !== "") {
    return enValue as T;
  }
  return nlValue;
}
