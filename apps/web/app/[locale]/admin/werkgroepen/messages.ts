import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";
import { LEAD_LABEL_MAX } from "@/lib/werkgroepen";

/** Gedeelde opslaan-meldingen, plus wat enkel bij werkgroepen speelt. */
export function werkgroepErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    LEAD_LABEL_INVALID: nl
      ? `Niet opgeslagen: geef de verantwoordelijke een titel van hoogstens ${LEAD_LABEL_MAX} tekens, bv. G3 of G4.`
      : `Not saved: give the lead a title of at most ${LEAD_LABEL_MAX} characters, e.g. G3 or G4.`,
    GROUP_CODE_TAKEN: nl
      ? "Niet opgeslagen: die code is al in gebruik."
      : "Not saved: that code is already in use.",
    FORBIDDEN: nl
      ? "Je kan enkel de tekst van je eigen werkgroep aanpassen."
      : "You can only edit your own werkgroep's text.",
  };
}
