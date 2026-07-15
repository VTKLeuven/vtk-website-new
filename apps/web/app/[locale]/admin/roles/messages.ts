import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Gedeelde opslaan-meldingen, plus wat enkel bij rollen speelt. */
export function roleErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    ROLE_CODE_TAKEN: nl
      ? "Niet opgeslagen: die rolcode is al in gebruik."
      : "Not saved: that role code is already in use.",
  };
}
