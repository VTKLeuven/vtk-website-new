import { headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, type Locale, getDictionary } from "@vtk/i18n";

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(raw: string | undefined | null): Locale {
  if (raw && hasLocale(raw)) return raw;
  return DEFAULT_LOCALE;
}

export async function currentLocale(): Promise<Locale> {
  // When rewriting from "/foo" to "/nl/foo" Next doesn't pass a param here, so
  // we also inspect the pathname header as a fallback.
  const h = await headers();
  const path = h.get("x-invoke-path") || h.get("next-url") || "";
  const first = path.split("/")[1];
  return normalizeLocale(first);
}

export async function dict(locale?: Locale) {
  const l = locale ?? (await currentLocale());
  return getDictionary(l);
}

export { DEFAULT_LOCALE, LOCALES, type Locale };
