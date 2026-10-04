import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/**
 * Foutcodes uit `app/actions/expenses.ts` naar een melding die zegt wat er
 * misging. Bovenop de gedeelde meldingen uit `lib/saveMessages.ts`.
 *
 * `maxWords` komt uit de instellingen; zonder valt de melding over de
 * woordengrens terug op een zin zonder getal.
 */
export function expenseErrorMessages(locale: Locale, maxWords?: number): Record<string, string> {
  const shared = saveErrorMessages(locale);
  if (locale === "nl") {
    const limit = maxWords
      ? `maximaal ${maxWords} ${maxWords === 1 ? "woord" : "woorden"}`
      : "maar een paar woorden";
    return {
      ...shared,
      TOO_MANY_WORDS_ACTIVITY: `Niet opgeslagen: de activiteit mag ${limit} tellen. Zet de rest in de opmerking.`,
      TOO_MANY_WORDS_DESCRIPTION: `Niet opgeslagen: de omschrijving mag ${limit} tellen. Zet de rest in de opmerking.`,
      BAD_MAX_WORDS: "Niet opgeslagen: het aantal woorden moet een geheel getal van 1 tot 20 zijn.",
      MISSING_FIELD: "Niet opgeslagen: vul naam, activiteit en omschrijving in.",
      MISSING_RECEIPT: "Niet opgeslagen: er is nog geen bonnetje geüpload.",
      MISSING_IBAN: "Niet opgeslagen: bij een persoonlijke betaling is je rekeningnummer verplicht.",
      BAD_IBAN: "Niet opgeslagen: dat rekeningnummer klopt niet. Kijk het na, cijfer per cijfer.",
      BAD_AMOUNT: "Niet opgeslagen: het bedrag moet een getal groter dan nul zijn, bv. 10,23.",
      BAD_DATE: "Niet opgeslagen: die datum bestaat niet.",
      FUTURE_DATE: "Niet opgeslagen: de datum van de uitgave ligt in de toekomst.",
      BAD_POST: "Niet opgeslagen: kies eerst een post. Bij Groep 5 kies je praeses, vice, secretaris of beheer.",
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
  const limit = maxWords
    ? `at most ${maxWords} ${maxWords === 1 ? "word" : "words"}`
    : "only a few words";
  return {
    ...shared,
    TOO_MANY_WORDS_ACTIVITY: `Not saved: the activity may be ${limit}. Put the rest in the comment.`,
    TOO_MANY_WORDS_DESCRIPTION: `Not saved: the description may be ${limit}. Put the rest in the comment.`,
    BAD_MAX_WORDS: "Not saved: the number of words must be a whole number from 1 to 20.",
    MISSING_FIELD: "Not saved: fill in the name, activity and description.",
    MISSING_RECEIPT: "Not saved: no receipt has been uploaded yet.",
    MISSING_IBAN: "Not saved: your account number is required for a personal payment.",
    BAD_IBAN: "Not saved: that account number is not valid. Check it digit by digit.",
    BAD_AMOUNT: "Not saved: the amount must be a number greater than zero, e.g. 10.23.",
    BAD_DATE: "Not saved: that date does not exist.",
    FUTURE_DATE: "Not saved: the date of the expense is in the future.",
    BAD_POST: "Not saved: pick a post first. For Group 5, pick praeses, vice, secretary or administration.",
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
