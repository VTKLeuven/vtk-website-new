import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/**
 * Foutcodes uit `app/actions/kassas.ts` naar een melding die zegt wat er
 * misging. Bovenop de gedeelde meldingen uit `lib/saveMessages.ts`.
 */
export function kassaErrorMessages(locale: Locale): Record<string, string> {
  const shared = saveErrorMessages(locale);
  if (locale === "nl") {
    return {
      ...shared,
      BAD_DATE: "Niet opgeslagen: die datum bestaat niet.",
      MISSING_TIME: "Niet opgeslagen: vul het begin- en einduur van de activiteit in.",
      BAD_TIME: "Niet opgeslagen: begin- en einduur moeten een uur zijn, en mogen niet gelijk zijn.",
      MISSING_TERMINAL:
        "Niet aanvaard: kies een Bancontact-bakje of Payconiq-rekening voor wat de post vroeg. Heeft ze er toch geen nodig, vink het dan uit in de aanvraag.",
      MISSING_FIELD: "Niet opgeslagen: vul de activiteit en de verantwoordelijke in.",
      BAD_POST: "Niet opgeslagen: kies een post.",
      BAD_COUNT: "Niet opgeslagen: een aantal stuks of bonnen moet een geheel getal vanaf 0 zijn.",
      BAD_AMOUNT: "Niet opgeslagen: een bedrag moet een getal zijn, bv. 125,50.",
      BAD_TERMINAL: "Niet opgeslagen: kies voor elke regel met een bedrag een bakje of rekening.",
      BAD_STATUS: "Die status bestaat niet.",
      BAD_EMAIL: "Niet opgeslagen: dat e-mailadres klopt niet.",
      NOT_ACCEPTED: "Deze kassa is nog niet aanvaard. Aanvaard ze eerst, dan vertrekt ook de mail.",
      ALREADY_ACCEPTED: "Deze kassa was al aanvaard; ververs de pagina.",
      NOT_FOUND: "Die kassa bestaat niet meer; ververs de pagina.",
      LOCKED: "Beheer heeft deze aanvraag al aanvaard. Wil je nog iets wijzigen, mail dan naar Beheer.",
      FORBIDDEN: "Daar heb je geen rechten voor.",
    };
  }
  return {
    ...shared,
    BAD_DATE: "Not saved: that date does not exist.",
    MISSING_TIME: "Not saved: fill in the start and end time of the activity.",
    BAD_TIME: "Not saved: start and end must be a time of day, and cannot be the same.",
    MISSING_TERMINAL:
      "Not accepted: choose a Bancontact terminal or Payconiq account for what the post asked for. If they do not need one after all, untick it in the request.",
    MISSING_FIELD: "Not saved: fill in the activity and the person responsible.",
    BAD_POST: "Not saved: choose a post.",
    BAD_COUNT: "Not saved: a number of pieces or vouchers must be a whole number from 0.",
    BAD_AMOUNT: "Not saved: an amount must be a number, e.g. 125.50.",
    BAD_TERMINAL: "Not saved: choose a terminal or account for every line with an amount.",
    BAD_STATUS: "That status does not exist.",
    BAD_EMAIL: "Not saved: that email address is not valid.",
    NOT_ACCEPTED: "This cash register has not been accepted yet. Accept it first, so the email goes out too.",
    ALREADY_ACCEPTED: "This cash register was already accepted; refresh the page.",
    NOT_FOUND: "That cash register no longer exists; refresh the page.",
    LOCKED: "Administration already accepted this request. To change anything, email Administration.",
    FORBIDDEN: "You do not have permission for that.",
  };
}
