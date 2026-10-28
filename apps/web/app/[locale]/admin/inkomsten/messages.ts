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
    FILE_TOO_LARGE: "Dat bestand is groter dan 10 MB; een export van een kwartaal is veel kleiner.",
    EMPTY: "Dat bestand heeft geen regels.",
    UNKNOWN_FORMAT:
      "Dat bestand herkent de site niet. Laad een CSV-export van Payconiq of de betalingenexport van Mollie op.",
    MOLLIE_BALANCE:
      "Dat is het balansrapport van Mollie. Laad de betalingenexport op: daarin staat bij elke betaling in welke uitbetaling ze zit.",
    NOT_YET_SUPPORTED: "Exports van Europabank en SumUp komen in een volgende fase; die kan de site nog niet lezen.",
    BAD_ROW: "Een regel in dat bestand is niet te lezen (datum of bedrag). Er is niets opgeladen.",
    NOT_FOUND: "Dat bestaat niet meer; ververs de pagina.",
    CODE_NOT_FOUND: "Die boekhoudcode bestaat niet meer; ververs de pagina.",
    CODE_REQUIRED: "Kies een boekhoudcode, of kies dat het niet meetelt.",
    CANNOT_REMEMBER:
      "Enkel een vaste tekst kan onthouden worden. Wat iemand bij een sticker intypt, zegt volgende week niets meer.",
    LOCKED: "Dat valt in een afgesloten periode. Heropen de periode eerst bij Instellingen.",
    BAD_PERIOD: "Kies een geldige periode: de eerste maand mag niet na de laatste vallen.",
    PERIOD_OVERLAP: "Een deel van die periode is al afgesloten.",
    BAD_DATE: "Die datum bestaat niet.",
    ACCOUNT_REQUIRED: "Vul de rekening in.",
  };
  const en: Record<IncomeErrorCode, string> = {
    NO_FILE: "Choose a file first.",
    FILE_TOO_LARGE: "That file is larger than 10 MB; a quarterly export is much smaller.",
    EMPTY: "That file has no rows.",
    UNKNOWN_FORMAT: "The site does not recognise that file. Upload a Payconiq CSV export or the Mollie payments export.",
    MOLLIE_BALANCE:
      "That is the Mollie balance report. Upload the payments export: it says for each payment which payout it is in.",
    NOT_YET_SUPPORTED: "Europabank and SumUp exports come in a later phase; the site cannot read them yet.",
    BAD_ROW: "A row in that file cannot be read (date or amount). Nothing was uploaded.",
    NOT_FOUND: "That no longer exists; refresh the page.",
    CODE_NOT_FOUND: "That accounting code no longer exists; refresh the page.",
    CODE_REQUIRED: "Choose an accounting code, or choose that it does not count.",
    CANNOT_REMEMBER: "Only a fixed text can be remembered. What someone types at a sticker means nothing next week.",
    LOCKED: "That falls in a closed period. Reopen the period under Settings first.",
    BAD_PERIOD: "Choose a valid period: the first month cannot come after the last.",
    PERIOD_OVERLAP: "Part of that period is already closed.",
    BAD_DATE: "That date does not exist.",
    ACCOUNT_REQUIRED: "Fill in the account.",
  };
  return { ...shared, ...(locale === "nl" ? nl : en) };
}
