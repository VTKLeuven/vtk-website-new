import { InfoTip } from "@/components/ui/InfoTip";
import { EXPORT_COLUMNS, type ExportColumn, type IncomeFormat } from "@/lib/inkomsten/parse";

type Guide = { format: IncomeFormat; title: { nl: string; en: string }; what: { nl: string; en: string }; counts: { nl: string; en: string } };

/**
 * Wat de site per bron verwacht, in de volgorde waarin ze een bestand herkent.
 * De kolommen komen uit `EXPORT_COLUMNS`, de lijst waarmee de parser zelf
 * herkent en leest: wat hier staat, is dus wat de site echt nodig heeft. De
 * zinnen erbij beschrijven wat de parser met de regels doet; verander je dat
 * in `parse.ts`, pas het dan ook hier aan.
 */
const GUIDES: Guide[] = [
  {
    format: "payconiq",
    title: { nl: "Payconiq", en: "Payconiq" },
    what: {
      nl: "De transactie-export van een Payconiq-account, met alle stickers samen.",
      en: "The transaction export of a Payconiq account, with all stickers together.",
    },
    counts: {
      nl: "Telt: status SUCCEEDED, type DEBIT als terugbetaling. Het kanaal is shop_name. Datum en uur op de Brusselse klok.",
      en: "Counts: status SUCCEEDED, type DEBIT as a refund. The channel is shop_name. Date and time on the Brussels clock.",
    },
  },
  {
    format: "mollie",
    title: { nl: "Mollie, betalingen", en: "Mollie, payments" },
    what: {
      nl: "De betalingenexport, of de export per uitbetaling (met de regels \"Withheld fees\", \"Balance correction\" en \"rolling reserve\"). Engelse of Nederlandse koppen. Enkel de export per uitbetaling heeft de kosten en de reserve per uitbetaling; met de betalingenexport komt de som per uitbetaling niet uit op de overschrijving.",
      en: "The payments export, or the export per payout (with the \"Withheld fees\", \"Balance correction\" and \"rolling reserve\" rows). English or Dutch headings. Only the export per payout has the fees and reserve per payout; with the payments export the sum per payout does not come to the transfer.",
    },
    counts: {
      nl: "Telt: status paid, paidout of refunded, in de maand van de uitbetaling (de referentie zegt welke: 12345678.2608.01 is augustus 2026). Zonder uitbetaling wacht een betaling tot een latere export ze noemt.",
      en: "Counts: status paid, paidout or refunded, in the month of the payout (the reference says which: 12345678.2608.01 is August 2026). Without a payout a payment waits until a later export lists it.",
    },
  },
  {
    format: "mollie-balance",
    title: { nl: "Mollie, balansrapport", en: "Mollie, balance report" },
    what: {
      nl: "Elke beweging op het Mollie-saldo: de overschrijvingen naar de bank (transfer), de maandfactuur (invoice) en de reserve.",
      en: "Every movement on the Mollie balance: the transfers to the bank (transfer), the monthly invoice (invoice) and the reserve.",
    },
    counts: {
      nl: "De betalingen erin slaat de site over: die komen uit de betalingenexport. De maandfactuur en de reserve staan op de laatste seconde van de maand en tellen in die maand; een terugbetaling gaat mee met de eerstvolgende overschrijving. Een overschrijving is het bedrag op het uittreksel.",
      en: "The site skips the payments in it: those come from the payments export. The monthly invoice and the reserve sit on the last second of the month and count in that month; a refund goes with the next transfer. A transfer is the amount on the bank statement.",
    },
  },
  {
    format: "sumup",
    title: { nl: "SumUp", en: "SumUp" },
    what: {
      nl: "De transacties van één SumUp-account (de kolom e-mail is het account).",
      en: "The transactions of one SumUp account (the e-mail column is the account).",
    },
    counts: {
      nl: "Telt: Omzet met status Succesvol, voor het totaalbedrag; de transactiekosten worden een kostenregel. Een regel Uitbetaling brengt het nummer en de dag van de uitbetaling, en telt niet nog eens.",
      en: "Counts: Omzet with status Succesvol, for the total amount; the transaction fees become a fee row. An Uitbetaling row brings the payout's number and day, and does not count again.",
    },
  },
  {
    format: "europabank",
    title: { nl: "Europabank", en: "Europabank" },
    what: {
      nl: "De transacties van één terminal, zoals het portaal ze per dag geeft: kies de bestanden van een maand allemaal tegelijk. De opmaak tot maart 2026 en die erna.",
      en: "The transactions of one terminal, as the portal gives them per day: choose the files of a month all at once. The layout until March 2026 and the one after.",
    },
    counts: {
      nl: "Telt: resultaat Sale of Goedgekeurd; de commissie wordt een kost. Het uur komt uit Tijd (103804 is 10:38:04).",
      en: "Counts: result Sale or Goedgekeurd; the commission becomes a fee. The time comes from Tijd (103804 is 10:38:04).",
    },
  },
];

function ColumnList({ columns, nl }: { columns: readonly ExportColumn[]; nl: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {columns.map((column) => (
        <li key={column.names[0]} className="rounded-md bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px]">
          {column.names.join(nl ? " of " : " or ")}
        </li>
      ))}
    </ul>
  );
}

/** Per bron een "i" met de kolommen en wat de site ermee doet. */
export function FormatGuide({ nl }: { nl: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-vtk-muted">{nl ? "Wat de site verwacht:" : "What the site expects:"}</span>
      {GUIDES.map((guide) => {
        const columns = Object.values(EXPORT_COLUMNS[guide.format]) as ExportColumn[];
        const title = nl ? guide.title.nl : guide.title.en;
        return (
          <span key={guide.format} className="inline-flex items-center gap-1">
            {title}
            <InfoTip label={nl ? `Welke kolommen: ${title}` : `Which columns: ${title}`}>
              <p className="font-medium">{title}</p>
              <p>{nl ? guide.what.nl : guide.what.en}</p>
              <div>
                <p className="mb-1">{nl ? "Moet erin staan:" : "Must be there:"}</p>
                <ColumnList columns={columns.filter((column) => column.required)} nl={nl} />
              </div>
              <div>
                <p className="mb-1">{nl ? "Leest de site als het er is:" : "Read when present:"}</p>
                <ColumnList columns={columns.filter((column) => !column.required)} nl={nl} />
              </div>
              <p>{nl ? guide.counts.nl : guide.counts.en}</p>
              <p className="text-vtk-muted">
                {nl
                  ? "Op naam, dus de volgorde en hoofdletters maken niet uit. Een komma of puntkomma tussen de kolommen. Andere kolommen (namen, rekening- en kaartnummers) leest de site niet."
                  : "By name, so order and capitals do not matter. A comma or semicolon between columns. Other columns (names, account and card numbers) are not read."}
              </p>
            </InfoTip>
          </span>
        );
      })}
    </div>
  );
}
