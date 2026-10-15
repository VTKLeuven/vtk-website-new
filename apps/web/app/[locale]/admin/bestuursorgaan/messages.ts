import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Gedeelde opslaan-meldingen, plus wat enkel bij het Bestuursorgaan speelt. */
export function boErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    NOT_CONFIGURED: nl
      ? "Niet gelezen: de Google-koppeling is nog niet ingesteld. Dat doet IT bij Configuratie."
      : "Not read: the Google link is not set up yet. IT does that under Configuration.",
    NO_DRIVE_ACCOUNT: nl
      ? "Niet gelezen: er is nog geen Drive-account gekozen waarmee de site de map leest. Dat doet IT bij Configuratie."
      : "Not read: no Drive account has been chosen to read the folder with yet. IT does that under Configuration.",
    NO_FOLDER: nl
      ? "Niet gelezen: vul eerst bij Instellingen de link naar de gedeelde drive Praesidium in."
      : "Not read: first fill in the link to the shared drive Praesidium under Settings.",
    INVALID_LINK: nl
      ? "Niet opgeslagen: dat is geen link naar een map in Google Drive. Kopieer de link uit de adresbalk terwijl de map open staat."
      : "Not saved: that is not a link to a Google Drive folder. Copy the link from the address bar while the folder is open.",
    FOLDER_REQUIRED: nl
      ? "Niet opgeslagen: vul minstens de link naar de gedeelde drive Praesidium in."
      : "Not saved: fill in at least the link to the shared drive Praesidium.",
    GROUP_REQUIRED: nl ? "Niet opgeslagen: kies een post." : "Not saved: choose a post.",
    ALIAS_NOT_FOUND: nl
      ? "Deze koppeling bestaat niet meer; iemand anders heeft ze net verwijderd."
      : "This link no longer exists; someone else just removed it.",
    DOCUMENT_NOT_FOUND: nl
      ? "Dit resultaat staat niet meer in het overzicht. Herlaad de pagina."
      : "This result is no longer in the overview. Reload the page.",
    BUDGET_REQUIRED: nl ? "Niet opgeslagen: kies een budget." : "Not saved: choose a budget.",
  };
}

/** Waarom er bij een bestand geen bedrag staat. Codes uit `lib/bo/scan.ts`. */
export function figuresErrorText(code: string, nl: boolean): string {
  switch (code) {
    case "NO_ACCESS":
      return nl ? "De site kan dit bestand niet openen." : "The site cannot open this file.";
    case "NOT_SPREADSHEET":
      return nl ? "Geen Google Sheet of xlsx, dus geen bedragen." : "Not a Google Sheet or xlsx, so no amounts.";
    case "TOO_LARGE":
      return nl ? "Groter dan 15 MB; niet gelezen." : "Larger than 15 MB; not read.";
    case "NO_OVERVIEW":
      return nl
        ? "Geen blok Overzicht met de kolommen Budget en Resultaat gevonden; is dit het sjabloon van de penning?"
        : "No Overview block with the columns Budget and Result; is this the treasurer's template?";
    case "UNREADABLE":
      return nl ? "Het rekenblad kon niet gelezen worden." : "The spreadsheet could not be read.";
    default:
      return nl ? "Downloaden mislukte; de volgende ronde probeert het opnieuw." : "Download failed; the next round tries again.";
  }
}
