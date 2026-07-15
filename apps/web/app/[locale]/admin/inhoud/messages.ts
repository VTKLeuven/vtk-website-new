import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** De gedeelde meldingen, plus wat enkel bij categorieën en pagina's speelt. */
export function contentErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    SLUG_TAKEN: nl
      ? "Niet opgeslagen: die slug is al in gebruik. Slugs zijn uniek over de hele site."
      : "Not saved: that slug is already in use. Slugs are unique across the whole site.",
    CODE_TAKEN: nl
      ? "Niet opgeslagen: die code is al in gebruik."
      : "Not saved: that code is already in use.",
  };
}
