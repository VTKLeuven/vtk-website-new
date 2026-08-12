import { headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, type Locale, getDictionary } from "@vtk/i18n";

/**
 * Taalcode voor het `lang`-attribuut op `<html>`. Belgisch Nederlands is een
 * echte variant: een screenreader spreekt er anders om, en het is het signaal
 * waarmee een browser vertalen aanbiedt. Kaal `nl` gooit dat weg.
 */
export const HTML_LANG: Record<Locale, string> = { nl: "nl-BE", en: "en" };

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(raw: string | undefined | null): Locale {
  if (raw && hasLocale(raw)) return raw;
  return DEFAULT_LOCALE;
}

/**
 * De taal die bij een intern pad hoort. Zonder voorvoegsel, of met een
 * voorvoegsel dat geen taal is, valt alles terug op het Nederlands: dat is de
 * taal van de voorvoegselloze URL's.
 */
export function localeFromPath(path: string | null | undefined): Locale {
  return normalizeLocale((path ?? "").split("/")[1]);
}

export async function currentLocale(): Promise<Locale> {
  // Bij een rewrite van "/foo" naar "/nl/foo" geeft Next hier geen param door,
  // dus lezen we het pad uit de headers. `x-pathname` is de header die
  // `proxy.ts` zelf zet en draagt altijd het taalvoorvoegsel; de twee andere
  // zijn interne headers van Next en staan er enkel als vangnet.
  const h = await headers();
  const path = h.get("x-pathname") || h.get("x-invoke-path") || h.get("next-url") || "";
  return localeFromPath(path);
}

export async function dict(locale?: Locale) {
  const l = locale ?? (await currentLocale());
  return getDictionary(l);
}

export { DEFAULT_LOCALE, LOCALES, type Locale };
