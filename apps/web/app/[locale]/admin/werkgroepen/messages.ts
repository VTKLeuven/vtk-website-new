import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Gedeelde opslaan-meldingen, plus wat enkel bij werkgroepen speelt. */
export function werkgroepErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    GROUP_CODE_TAKEN: nl
      ? "Niet opgeslagen: die code is al in gebruik."
      : "Not saved: that code is already in use.",
    FORBIDDEN: nl
      ? "Je kan enkel de tekst van je eigen werkgroep aanpassen."
      : "You can only edit your own werkgroep's text.",
  };
}
