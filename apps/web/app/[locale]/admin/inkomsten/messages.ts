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
      "Dat bestand herkent de site niet. Upload een CSV-export van Payconiq, Mollie, SumUp of Europabank, of een CSV-afschrift van KBC, met de kolomkoppen zoals ze uit het portaal komen; de i naast elke bron zegt welke kolommen er moeten zijn.",
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
    LENDING_ORDER: "De laatste dag ligt voor de eerste.",
    MIXED_ACCOUNTS: "Dat afschrift heeft regels van meer dan één rekening. Download het per rekening uit KBC.",
    BAD_AMOUNT: "Dat bedrag is niet te lezen. Tik het zoals 12,50; een terugbetaling met een min ervoor (-12,50).",
    LENDING_TOO_LONG: "Een uitlening van meer dan een jaar is wellicht een tikfout in het jaartal.",
    LENDING_OVERLAP:
      "Dat toestel is op een van die dagen al uitgeleend (zie de lijst eronder). Pas die uitlening aan, of kies andere dagen.",
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
      "The site does not recognise that file. Upload a CSV export from Payconiq, Mollie, SumUp or Europabank, or a KBC CSV statement, with the column headings as they come from the portal; the i next to each source says which columns must be there.",
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
    LENDING_ORDER: "The last day comes before the first.",
    MIXED_ACCOUNTS: "That statement has lines of more than one account. Download it per account from KBC.",
    BAD_AMOUNT: "That amount cannot be read. Type it like 12.50; a refund with a minus in front (-12.50).",
    LENDING_TOO_LONG: "A lending of more than a year is probably a typo in the year.",
    LENDING_OVERLAP: "That device is already lent out on one of those days (see the list below). Change that lending, or choose other days.",
    ACCOUNT_REQUIRED: "Fill in the account.",
    DEVICE_NOT_FOUND: "That device is not (or no longer) in the cash register settings, or does not fit this channel; refresh the page.",
    FILTER_CHANGED:
      "Since the page loaded, more or fewer transactions match the filter (an import, or someone else assigning). Nothing was changed; refresh the page and look again.",
    NOTHING_SELECTED: "Tick one or more transactions first.",
  };
  return { ...shared, ...(locale === "nl" ? nl : en) };
}
