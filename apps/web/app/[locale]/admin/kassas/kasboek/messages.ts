import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Foutcodes uit `app/actions/cashBook.ts` naar een melding die zegt wat er misging. */
export function cashBookErrorMessages(locale: Locale): Record<string, string> {
  const shared = saveErrorMessages(locale);
  if (locale === "nl") {
    return {
      ...shared,
      BAD_DATE: "Niet opgeslagen: die datum bestaat niet.",
      FUTURE_DATE: "Niet opgeslagen: die datum ligt in de toekomst.",
      BAD_AMOUNT: "Niet opgeslagen: het bedrag moet een getal boven nul zijn, bv. 125,50.",
      MISSING_DESCRIPTION: "Niet opgeslagen: vul een omschrijving in.",
      MISSING_INVOICE: "Niet opgeslagen: een aankoop met cash heeft altijd een factuur. Voeg ze toe.",
      NOT_FOUND: "Die regel bestaat niet meer; ververs de pagina.",
      FORBIDDEN: "Daar heb je geen rechten voor.",
    };
  }
  return {
    ...shared,
    BAD_DATE: "Not saved: that date does not exist.",
    FUTURE_DATE: "Not saved: that date lies in the future.",
    BAD_AMOUNT: "Not saved: the amount must be a number above zero, e.g. 125.50.",
    MISSING_DESCRIPTION: "Not saved: enter a description.",
    MISSING_INVOICE: "Not saved: a cash purchase always has an invoice. Add it.",
    NOT_FOUND: "That line no longer exists; refresh the page.",
    FORBIDDEN: "You do not have the rights for that.",
  };
}
