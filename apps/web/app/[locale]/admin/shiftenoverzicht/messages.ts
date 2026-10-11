import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Gedeelde opslaan-meldingen, plus wat enkel bij het shiftenoverzicht speelt. */
export function overviewErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    FILE_REQUIRED: nl ? "Niet opgeladen: kies eerst een xlsx-bestand." : "Not uploaded: choose an xlsx file first.",
    FILE_TOO_LARGE: nl
      ? "Niet opgeladen: het bestand is groter dan 15 MB. Een shiftenlijst is zelden meer dan een paar MB; staan er foto's in?"
      : "Not uploaded: the file is larger than 15 MB. A shift list is rarely more than a few MB; does it contain photos?",
    NOT_XLSX: nl
      ? "Niet opgeladen: dit is geen xlsx. Exporteer de Google Sheet via Bestand > Downloaden > Microsoft Excel (.xlsx)."
      : "Not uploaded: this is not an xlsx. Export the Google Sheet via File > Download > Microsoft Excel (.xlsx).",
    NO_NAMES: nl
      ? "Niet opgeladen: er staan geen namen onder een uur in dit bestand. Is dit wel een shiftenlijst, en staan de uren bovenaan de kolommen (bv. 13u00-14u30)?"
      : "Not uploaded: no names found under a time in this file. Is this a shift list, with the times at the top of the columns (e.g. 13u00-14u30)?",
    NAME_REQUIRED: nl ? "Niet opgeslagen: geef een naam." : "Not saved: enter a name.",
    TARGET_REQUIRED: nl ? "Niet opgeslagen: kies bij wie deze bijnaam hoort." : "Not saved: choose who this nickname belongs to.",
    INVALID_NUMBER: nl
      ? "Niet opgeslagen: de richtlijn, het aantal open shiften en de lengte van een shift moeten getallen zijn."
      : "Not saved: the guideline, the number of open shifts and the shift length must be numbers.",
    NO_COLOR: nl
      ? "Niet opgeslagen: laat minstens één kleur meetellen, anders telt er niets op deze lijst."
      : "Not saved: keep at least one colour counted, or nothing on this list counts.",
    NO_SHEET: nl
      ? "Niet opgeslagen: laat minstens één tabblad meetellen, anders telt er niets op deze lijst."
      : "Not saved: keep at least one tab counted, or nothing on this list counts.",
    LIST_NOT_FOUND: nl
      ? "Deze lijst bestaat niet meer; iemand anders heeft ze net verwijderd."
      : "This list no longer exists; someone else just deleted it.",
    ALIAS_NOT_FOUND: nl ? "Deze bijnaam bestaat niet meer." : "This nickname no longer exists.",
    SHIFT_NOT_FOUND: nl
      ? "Niet opgeslagen: deze shift of inschrijving bestaat niet meer."
      : "Not saved: this shift or registration no longer exists.",
  };
}
