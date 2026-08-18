import type { Locale } from "@vtk/i18n";

/**
 * Meldingen voor de foutcodes die de meeste opslaan-acties teruggeven, zodat
 * elke beheerpagina niet zijn eigen bewoording verzint. Vul aan per surface waar
 * er specifiekere codes zijn (zie `admin/inhoud/messages.ts`).
 */
export function saveErrorMessages(locale: Locale): Record<string, string> {
  return locale === "nl"
    ? {
        INVALID_INPUT: "Niet opgeslagen: kijk de ingevulde velden na.",
        INVALID_URL:
          "Niet opgeslagen: een adres moet een pad op deze site zijn (/praesidium) of een volledig adres (https://...).",
        SLUG_TAKEN: "Niet opgeslagen: die slug is al in gebruik.",
      }
    : {
        INVALID_INPUT: "Not saved: please check the fields you entered.",
        INVALID_URL:
          "Not saved: an address must be a path on this site (/praesidium) or a full address (https://...).",
        SLUG_TAKEN: "Not saved: that slug is already in use.",
      };
}
