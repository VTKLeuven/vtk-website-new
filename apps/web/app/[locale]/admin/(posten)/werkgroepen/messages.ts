import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";
import { LEAD_LABEL_MAX } from "@/lib/werkgroepen";
import type { WerkingKind } from "@/lib/groupKinds";

/** Gedeelde opslaan-meldingen, plus wat enkel bij werkgroepen en jaarwerkingen speelt. */
export function werkgroepErrorMessages(locale: Locale, kind: WerkingKind = "WERKGROEP"): Record<string, string> {
  const nl = locale === "nl";
  const example = kind === "WERKGROEP" ? (nl ? "bv. G3 of G4" : "e.g. G3 or G4") : nl ? "bv. Verantwoordelijke" : "e.g. Verantwoordelijke";
  return {
    ...saveErrorMessages(locale),
    LEAD_LABEL_INVALID: nl
      ? `Niet opgeslagen: geef de verantwoordelijke een titel van hoogstens ${LEAD_LABEL_MAX} tekens, ${example}.`
      : `Not saved: give the lead a title of at most ${LEAD_LABEL_MAX} characters, ${example}.`,
    GROUP_CODE_TAKEN: nl
      ? "Niet opgeslagen: die code is al in gebruik."
      : "Not saved: that code is already in use.",
    // Enkel de infotekst van een werkgroep kan een gewoon lid opslaan.
    FORBIDDEN: nl
      ? "Je kan enkel de tekst van je eigen werkgroep aanpassen."
      : "You can only edit your own werkgroep's text.",
  };
}
