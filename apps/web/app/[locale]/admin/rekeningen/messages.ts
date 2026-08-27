import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/**
 * Foutcodes uit `app/actions/expenses.ts` naar een melding die zegt wat er
 * misging. Bovenop de gedeelde meldingen uit `lib/saveMessages.ts`.
 */
export function expenseErrorMessages(locale: Locale): Record<string, string> {
  const shared = saveErrorMessages(locale);
  if (locale === "nl") {
    return {
      ...shared,
      MISSING_FIELD: "Niet opgeslagen: vul naam, activiteit en omschrijving in.",
      MISSING_RECEIPT: "Niet opgeslagen: er is nog geen bonnetje geüpload.",
      MISSING_IBAN: "Niet opgeslagen: bij een persoonlijke betaling is je rekeningnummer verplicht.",
      BAD_IBAN: "Niet opgeslagen: dat rekeningnummer klopt niet. Kijk het na, cijfer per cijfer.",
      BAD_AMOUNT: "Niet opgeslagen: het bedrag moet een getal groter dan nul zijn, bv. 10,23.",
      BAD_DATE: "Niet opgeslagen: die datum bestaat niet.",
      FUTURE_DATE: "Niet opgeslagen: de datum van de uitgave ligt in de toekomst.",
      BAD_POST: "Niet opgeslagen: kies eerst een post.",
      BAD_EMAIL: "Niet verstuurd: dat e-mailadres klopt niet.",
      NOT_FOUND: "Die rekening bestaat niet meer; ververs de pagina.",
      LOCKED:
        "Niet opgeslagen: deze rekening is al terugbetaald, doorgestuurd of ingeboekt. Haal eerst het vinkje weg.",
      FORBIDDEN: "Daar heb je geen rechten voor.",
      NO_SMTP:
        "Niet verstuurd: er is geen mailserver ingesteld op deze omgeving. Download het blad en stuur het zelf door.",
      SEND_FAILED: "Niet verstuurd: de mailserver weigerde het bericht. Probeer opnieuw.",
    };
  }
  return {
    ...shared,
    MISSING_FIELD: "Not saved: fill in the name, activity and description.",
    MISSING_RECEIPT: "Not saved: no receipt has been uploaded yet.",
    MISSING_IBAN: "Not saved: your account number is required for a personal payment.",
    BAD_IBAN: "Not saved: that account number is not valid. Check it digit by digit.",
    BAD_AMOUNT: "Not saved: the amount must be a number greater than zero, e.g. 10.23.",
    BAD_DATE: "Not saved: that date does not exist.",
    FUTURE_DATE: "Not saved: the date of the expense is in the future.",
    BAD_POST: "Not saved: pick a post first.",
    BAD_EMAIL: "Not sent: that email address is not valid.",
    NOT_FOUND: "That expense no longer exists; refresh the page.",
    LOCKED:
      "Not saved: this expense is already reimbursed, forwarded or booked. Clear that first.",
    FORBIDDEN: "You do not have the rights for that.",
    NO_SMTP:
      "Not sent: no mail server is configured on this environment. Download the sheet and forward it yourself.",
    SEND_FAILED: "Not sent: the mail server refused the message. Try again.",
  };
}
