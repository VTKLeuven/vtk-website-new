import type { Locale } from "@vtk/i18n";

export type FallbackLang = "nl-BE" | "en";

/**
 * Kiest tekst met een optionele `lang`-tag wanneer de gevraagde taal
 * ontbreekt en terugvalt op de andere taal (`WCAG 3.1.2 Language of Parts`).
 */
export function pickWithLang(
  nlValue: string,
  enValue: string | null | undefined,
  locale: Locale,
): { text: string; lang: FallbackLang | undefined } {
  if (locale === "en") {
    if (enValue != null && enValue.trim() !== "") {
      return { text: enValue, lang: undefined };
    }
    return {
      text: nlValue,
      lang: nlValue.trim() !== "" ? "nl-BE" : undefined,
    };
  }
  if (nlValue.trim() !== "") {
    return { text: nlValue, lang: undefined };
  }
  if (enValue != null && enValue.trim() !== "") {
    return { text: enValue, lang: "en" };
  }
  return { text: nlValue, lang: undefined };
}

/**
 * Geeft enkel de terugval-`lang` terug zonder de tekst opnieuw te kiezen.
 */
export function fallbackLang(
  nlValue: string | null | undefined,
  enValue: string | null | undefined,
  locale: Locale,
): FallbackLang | undefined {
  const nl = (nlValue ?? "").trim();
  const en = (enValue ?? "").trim();
  if (locale === "en") {
    return en === "" && nl !== "" ? "nl-BE" : undefined;
  }
  return nl === "" && en !== "" ? "en" : undefined;
}
