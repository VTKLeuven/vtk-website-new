import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";
import type { IncomeErrorCode } from "@/app/actions/inkomsten";

/**
 * Foutcodes uit `app/actions/inkomsten.ts` naar een melding die zegt wat er
 * misging. Bovenop de gedeelde meldingen uit `lib/saveMessages.ts`.
 */
export function incomeErrorMessages(locale: Locale): Record<string, string> {
  const shared = saveErrorMessages(locale);
  const nl: Record<IncomeErrorCode, string> = {
    NO_FILE: "Kies eerst een bestand.",
    FILE_TOO_LARGE:
      "Dat is te groot: een bestand mag tot 10 MB, een keuze samen tot 40 MB. Een export van een kwartaal is veel kleiner.",
    TOO_MANY_FILES: "Dat zijn meer dan 250 bestanden. Upload ze in delen, bijvoorbeeld per maand.",
    EMPTY: "Dat bestand heeft geen regels.",
    UNKNOWN_FORMAT:
      "Dat bestand herkent de site niet. Upload een CSV-export van Payconiq, Mollie, SumUp of Europabank, met de kolomkoppen zoals ze uit het portaal komen; de i naast elke bron zegt welke kolommen er moeten zijn.",
    BAD_ROW: "Een regel in dat bestand is niet te lezen (datum of bedrag). Er is niets geüpload.",
    NOT_FOUND: "Dat bestaat niet meer; ververs de pagina.",
    CODE_NOT_FOUND: "Die boekhoudcode bestaat niet meer; ververs de pagina.",
    CODE_REQUIRED: "Kies een boekhoudcode, of kies dat het niet meetelt.",
    CANNOT_REMEMBER:
      "Enkel een vaste tekst kan onthouden worden. Wat iemand bij een sticker intypt, of een kaartbetaling zonder tekst, zegt volgende week niets meer.",
    LOCKED: "Dat valt in een afgesloten periode. Heropen de periode eerst bij Instellingen.",
    BAD_PERIOD: "Kies een geldige periode: de eerste maand mag niet na de laatste vallen.",
    PERIOD_OVERLAP: "Een deel van die periode is al afgesloten.",
    BAD_DATE: "Die datum bestaat niet.",
    DAY_EMPTY:
      "Dat kanaal heeft die dag (van 9:00 tot 9:00 de ochtend erna) geen betaling die met de hand een code kan krijgen, of niets wat met de hand gezet werd. Een betaling van de site, een code in de tekst, een onthouden tekst of een kassa blijft zoals ze is.",
    ACCOUNT_REQUIRED: "Vul de rekening in.",
    DEVICE_NOT_FOUND:
      "Dat toestel staat niet (meer) in de instellingen van de kassa's, of past niet bij dit kanaal; ververs de pagina.",
    FILTER_CHANGED:
      "Sinds de pagina laadde, voldoen er meer of minder transacties aan de filter (een import, of iemand anders die toewees). Er is niets veranderd; ververs de pagina en kijk opnieuw.",
    NOTHING_SELECTED: "Vink eerst een of meer transacties aan.",
  };
  const en: Record<IncomeErrorCode, string> = {
    NO_FILE: "Choose a file first.",
    FILE_TOO_LARGE: "That is too large: a file can be up to 10 MB, a selection up to 40 MB together. A quarterly export is much smaller.",
    TOO_MANY_FILES: "That is more than 250 files. Upload them in parts, for example per month.",
    EMPTY: "That file has no rows.",
    UNKNOWN_FORMAT:
      "The site does not recognise that file. Upload a CSV export from Payconiq, Mollie, SumUp or Europabank, with the column headings as they come from the portal; the i next to each source says which columns must be there.",
    BAD_ROW: "A row in that file cannot be read (date or amount). Nothing was uploaded.",
    NOT_FOUND: "That no longer exists; refresh the page.",
    CODE_NOT_FOUND: "That accounting code no longer exists; refresh the page.",
    CODE_REQUIRED: "Choose an accounting code, or choose that it does not count.",
    CANNOT_REMEMBER:
      "Only a fixed text can be remembered. What someone types at a sticker, or a card payment without text, means nothing next week.",
    LOCKED: "That falls in a closed period. Reopen the period under Settings first.",
    BAD_PERIOD: "Choose a valid period: the first month cannot come after the last.",
    PERIOD_OVERLAP: "Part of that period is already closed.",
    BAD_DATE: "That date does not exist.",
    DAY_EMPTY:
      "That channel has no payment that day (from 9:00 to 9:00 the next morning) that can get a code by hand, or nothing that was set by hand. A payment from the site, a code in the text, a remembered text or a cash register stays as it is.",
    ACCOUNT_REQUIRED: "Fill in the account.",
    DEVICE_NOT_FOUND: "That device is not (or no longer) in the cash register settings, or does not fit this channel; refresh the page.",
    FILTER_CHANGED:
      "Since the page loaded, more or fewer transactions match the filter (an import, or someone else assigning). Nothing was changed; refresh the page and look again.",
    NOTHING_SELECTED: "Tick one or more transactions first.",
  };
  return { ...shared, ...(locale === "nl" ? nl : en) };
}
