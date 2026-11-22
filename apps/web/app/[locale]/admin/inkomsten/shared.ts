import type { YMD } from "@/lib/brussels";
import type { IncomeKindCode, IncomeSourceCode } from "@/lib/inkomsten/parse";
import type { IncomeRuleCode } from "@/lib/inkomsten/match";
import type { IncomeCheck } from "@/lib/inkomsten/overview";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { monthLabel } from "@/lib/inkomsten/labels";

/** De naam van een bron, zoals ze in de kolomkop en de lijst staat. */
export const SOURCE_LABELS: Record<IncomeSourceCode, string> = {
  PAYCONIQ: "Payconiq",
  MOLLIE: "Mollie",
  SUMUP: "SumUp",
  EUROPABANK: "Europabank",
};

export { monthLabel, periodLabel } from "@/lib/inkomsten/labels";

/** Waarom een transactie haar code heeft: de koppelregel, in de lijst en in het detail. */
export const RULE_LABELS: Record<IncomeRuleCode, { nl: string; en: string }> = {
  MANUAL: { nl: "Met de hand", en: "By hand" },
  WEBSITE: { nl: "Betaling van de site", en: "Payment from the site" },
  CODE_IN_TEXT: { nl: "Code in de tekst", en: "Code in the text" },
  NAME_RULE: { nl: "Onthouden tekst", en: "Remembered text" },
  CHANNEL_LENDING: { nl: "Uitlening van het toestel", en: "Lending of the device" },
  CHANNEL_DEFAULT: { nl: "Standaardcode van het kanaal", en: "Default code of the channel" },
  CASH_REGISTER: { nl: "Kassa", en: "Cash register" },
};

export const KIND_LABELS: Record<IncomeKindCode, { nl: string; en: string }> = {
  PAYMENT: { nl: "Betaling", en: "Payment" },
  REFUND: { nl: "Terugbetaling", en: "Refund" },
  FEE: { nl: "Kosten", en: "Fees" },
  RESERVE: { nl: "Reserve", en: "Reserve" },
};

/**
 * Het lopende kalenderkwartaal en de vier ervoor, als snelkeuze. Een andere
 * reeks (augustus en september, enkel juli) kiest Beheer zelf: de site legt
 * geen boekjaar vast.
 */
export function quarterOptions(today: YMD): Array<{ from: string; to: string; label: string }> {
  const options: Array<{ from: string; to: string; label: string }> = [];
  let year = today.year;
  let quarter = Math.floor((today.month - 1) / 3) + 1;
  for (let i = 0; i < 5; i++) {
    const first = (quarter - 1) * 3 + 1;
    const pad = (m: number) => String(m).padStart(2, "0");
    options.push({ from: `${year}-${pad(first)}`, to: `${year}-${pad(first + 2)}`, label: `Q${quarter} ${year}` });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return options;
}

/** Eén stap van de controlelijst in woorden, met waar je ze oplost. */
export function checkText(
  check: IncomeCheck,
  nl: boolean,
  locale: "nl" | "en",
  base: string,
): { ok: boolean; text: string; href?: string } {
  const euro = (cents: number) => formatEuro(cents, locale);
  const count = (n: number) => (nl ? (n === 1 ? "1 transactie" : `${n} transacties`) : n === 1 ? "1 transaction" : `${n} transactions`);
  switch (check.key) {
    case "coverage":
      return check.ok
        ? {
            ok: true,
            text: nl
              ? "Elke voorbije maand heeft regels van elke bron en elk toestel."
              : "Every past month has rows from every source and device.",
          }
        : {
            ok: false,
            text:
              (nl ? "Geen enkele regel van " : "No rows from ") +
              check.missing
                .map((gap) => `${gap.channel ? `${SOURCE_LABELS[gap.source]} ${gap.channel}` : SOURCE_LABELS[gap.source]} in ${monthLabel(gap.month, nl)}`)
                .join(", ") +
              (nl ? ": nog niet geüpload, of toen niet gebruikt?" : ": not uploaded yet, or not used then?"),
            href: `${base}/admin/inkomsten/opladen`,
          };
    case "mollieFees":
      return check.ok
        ? { ok: true, text: nl ? "De Mollie-kosten en de reserve zitten erin." : "The Mollie fees and reserve are in." }
        : {
            ok: false,
            text:
              (nl ? "Geen Mollie-kosten in " : "No Mollie fees in ") +
              check.months.map((month) => monthLabel(month, nl)).join(", ") +
              (nl
                ? ": upload het balansrapport van Mollie, of de export per uitbetaling met de regels \"Withheld fees\"."
                : ": upload the Mollie balance report, or the export per payout with the \"Withheld fees\" rows."),
            href: `${base}/admin/inkomsten/opladen`,
          };
    case "mollieFeesTwice":
      return check.ok
        ? { ok: true, text: nl ? "De Mollie-kosten komen per maand uit één soort bestand." : "The Mollie fees come from one kind of file per month." }
        : {
            ok: false,
            text:
              (nl ? "Mollie-kosten uit het balansrapport én uit de export per uitbetaling in " : "Mollie fees from both the balance report and the export per payout in ") +
              check.months.map((month) => monthLabel(month, nl)).join(", ") +
              (nl
                ? ": dat is twee keer hetzelfde geld. Verwijder een van de twee bij de geüploade bestanden."
                : ": that is the same money twice. Delete one of the two under the uploaded files."),
            href: `${base}/admin/inkomsten/opladen`,
          };
    case "payouts":
      if (check.total === 0) return { ok: true, text: nl ? "Geen uitbetalingen van Mollie of SumUp in deze periode." : "No Mollie or SumUp payouts in this period." };
      return check.ok
        ? {
            ok: true,
            text:
              (nl
                ? `${check.total === 1 ? "De uitbetaling klopt" : `Alle ${check.total} uitbetalingen kloppen`} met het uittreksel of met de overschrijving van Mollie`
                : `All ${check.total} payouts match the bank statement or the Mollie transfer`) +
              (check.differs
                ? nl
                  ? `; bij ${check.differs} wijkt de som van de betalingen af van wat Mollie overschreef, en dat verschil zit in de reserve.`
                  : `; for ${check.differs} the sum of the payments differs from what Mollie transferred, and that difference is in the reserve.`
                : "."),
          }
        : {
            ok: false,
            text:
              (nl
                ? `${check.checked} van de ${check.total} uitbetalingen afgevinkt of gelijk aan de overschrijving`
                : `${check.checked} of ${check.total} payouts checked or equal to the transfer`) +
              (check.changed
                ? nl
                  ? `; bij ${check.changed} veranderde het bedrag na het afvinken.`
                  : `; ${check.changed} changed after checking.`
                : "."),
            href: "#per-uitbetaling",
          };
    case "mollieReserve": {
      if (check.ok) {
        return {
          ok: true,
          text: nl
            ? `De wijziging van de dynamische reserve is berekend uit ${check.transferCount === 1 ? "1 overschrijving" : `${check.transferCount} overschrijvingen`} van Mollie; de betalingenexport en het balansrapport noemen dezelfde betalingen.`
            : `The change in the rolling reserve is computed from ${check.transferCount === 1 ? "1 Mollie transfer" : `${check.transferCount} Mollie transfers`}; the payments export and the balance report list the same payments.`,
        };
      }
      const payments = (n: number) => (nl ? (n === 1 ? "1 betaling" : `${n} betalingen`) : n === 1 ? "1 payment" : `${n} payments`);
      const parts: string[] = [];
      if (check.missingInBalance.count) {
        parts.push(
          nl
            ? `${payments(check.missingInBalance.count)} uit de betalingenexport (${euro(check.missingInBalance.cents)}) ${check.missingInBalance.count === 1 ? "staat" : "staan"} in geen enkel balansrapport: upload het balansrapport van Mollie voor de hele periode`
            : `${payments(check.missingInBalance.count)} from the payments export (${euro(check.missingInBalance.cents)}) ${check.missingInBalance.count === 1 ? "is" : "are"} in no balance report: upload the Mollie balance report for the whole period`,
        );
      }
      if (check.missingInExport.count) {
        parts.push(
          nl
            ? `${payments(check.missingInExport.count)} uit het balansrapport (${euro(check.missingInExport.cents)}) ${check.missingInExport.count === 1 ? "staat" : "staan"} niet in de betalingenexport: upload de betalingenexport van Mollie voor de hele periode`
            : `${payments(check.missingInExport.count)} from the balance report (${euro(check.missingInExport.cents)}) ${check.missingInExport.count === 1 ? "is" : "are"} not in the payments export: upload the Mollie payments export for the whole period`,
        );
      }
      return {
        ok: false,
        text:
          parts.join("; ") +
          (nl
            ? ". Tot dan kent de site de wijziging van de dynamische reserve niet, en is de Mollie-kolom niet gelijk aan wat Mollie overschreef."
            : ". Until then the site does not know the change in the rolling reserve, and the Mollie column does not equal what Mollie transferred."),
        href: `${base}/admin/inkomsten/opladen`,
      };
    }
    case "open":
      return check.ok
        ? { ok: true, text: nl ? "Niets meer na te kijken." : "Nothing left to review." }
        : {
            ok: false,
            text: nl ? `${count(check.count)} (${euro(check.cents)}) nog na te kijken.` : `${count(check.count)} (${euro(check.cents)}) still to review.`,
            href: `${base}/admin/inkomsten/na-te-kijken`,
          };
    case "accounts":
      return check.ok
        ? { ok: true, text: nl ? "Elke transactie heeft een bankrekening." : "Every transaction has a bank account." }
        : {
            ok: false,
            text: nl
              ? `${count(check.count)} (${euro(check.cents)}) zonder bankrekening: stel de rekening van het kanaal in.`
              : `${count(check.count)} (${euro(check.cents)}) without a bank account: set the channel's account.`,
            href: `${base}/admin/inkomsten/instellingen`,
          };
    case "feeCode":
      return check.ok
        ? { ok: true, text: nl ? "De kostencode is gekozen, of er zijn geen kosten." : "The fee code is chosen, or there are no fees." }
        : {
            ok: false,
            text: nl ? "Er zijn kosten, maar nog geen kostencode." : "There are fees, but no fee code yet.",
            href: `${base}/admin/inkomsten/instellingen`,
          };
  }
}
