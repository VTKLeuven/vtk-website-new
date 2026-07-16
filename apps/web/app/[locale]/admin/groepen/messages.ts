import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Gedeelde opslaan-meldingen, plus wat enkel bij posten speelt. */
export function groupErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    GROUP_CODE_TAKEN: nl
      ? "Niet opgeslagen: die postcode is al in gebruik."
      : "Not saved: that post code is already in use.",
  };
}
