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
    TOO_MANY_FILES: "Dat zijn meer dan 250 bestanden. Laad ze in delen op, bijvoorbeeld per maand.",
    EMPTY: "Dat bestand heeft geen regels.",
    UNKNOWN_FORMAT:
      "Dat bestand herkent de site niet. Laad een CSV-export van Payconiq, Mollie, SumUp of Europabank op, met de kolomkoppen zoals ze uit het portaal komen.",
    MOLLIE_BALANCE:
      "Dat is het balansrapport van Mollie. Laad de betalingenexport op: daarin staat bij elke betaling in welke uitbetaling ze zit.",
    BAD_ROW: "Een regel in dat bestand is niet te lezen (datum of bedrag). Er is niets opgeladen.",
    NOT_FOUND: "Dat bestaat niet meer; ververs de pagina.",
    CODE_NOT_FOUND: "Die boekhoudcode bestaat niet meer; ververs de pagina.",
    CODE_REQUIRED: "Kies een boekhoudcode, of kies dat het niet meetelt.",
    CANNOT_REMEMBER:
      "Enkel een vaste tekst kan onthouden worden. Wat iemand bij een sticker intypt, of een kaartbetaling zonder tekst, zegt volgende week niets meer.",
    LOCKED: "Dat valt in een afgesloten periode. Heropen de periode eerst bij Instellingen.",
    BAD_PERIOD: "Kies een geldige periode: de eerste maand mag niet na de laatste vallen.",
    PERIOD_OVERLAP: "Een deel van die periode is al afgesloten.",
    BAD_DATE: "Die datum bestaat niet.",
    ACCOUNT_REQUIRED: "Vul de rekening in.",
    DEVICE_NOT_FOUND:
      "Dat toestel staat niet (meer) in de instellingen van de kassa's, of past niet bij dit kanaal; ververs de pagina.",
  };
  const en: Record<IncomeErrorCode, string> = {
    NO_FILE: "Choose a file first.",
    FILE_TOO_LARGE: "That is too large: a file can be up to 10 MB, a selection up to 40 MB together. A quarterly export is much smaller.",
    TOO_MANY_FILES: "That is more than 250 files. Upload them in parts, for example per month.",
    EMPTY: "That file has no rows.",
    UNKNOWN_FORMAT:
      "The site does not recognise that file. Upload a CSV export from Payconiq, Mollie, SumUp or Europabank, with the column headings as they come from the portal.",
    MOLLIE_BALANCE:
      "That is the Mollie balance report. Upload the payments export: it says for each payment which payout it is in.",
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
    ACCOUNT_REQUIRED: "Fill in the account.",
    DEVICE_NOT_FOUND: "That device is not (or no longer) in the cash register settings, or does not fit this channel; refresh the page.",
  };
  return { ...shared, ...(locale === "nl" ? nl : en) };
}
