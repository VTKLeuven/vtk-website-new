import type { YMD } from "@/lib/brussels";
import type { IncomeSourceCode } from "@/lib/inkomsten/parse";
import type { IncomeCheck } from "@/lib/inkomsten/overview";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { monthLabel } from "@/lib/inkomsten/labels";

/** De naam van een bron, zoals ze in de kolomkop en de lijst staat. */
export const SOURCE_LABELS: Record<IncomeSourceCode, string> = { PAYCONIQ: "Payconiq", MOLLIE: "Mollie" };

export { monthLabel, periodLabel } from "@/lib/inkomsten/labels";

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
        ? { ok: true, text: nl ? "Elke voorbije maand heeft regels van elke bron." : "Every past month has rows from every source." }
        : {
            ok: false,
            text:
              (nl ? "Geen enkele regel van " : "No rows from ") +
              check.missing.map((gap) => `${SOURCE_LABELS[gap.source]} in ${monthLabel(gap.month, nl)}`).join(", ") +
              (nl ? ": nog niet opgeladen?" : ": not uploaded yet?"),
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
                ? ": laad de Mollie-export op mét de regels \"Withheld fees\" en \"rolling reserve\"."
                : ": upload the Mollie export with the \"Withheld fees\" and \"rolling reserve\" rows."),
            href: `${base}/admin/inkomsten/opladen`,
          };
    case "payouts":
      if (check.total === 0) return { ok: true, text: nl ? "Geen Mollie-uitbetalingen in deze periode." : "No Mollie payouts in this period." };
      return check.ok
        ? {
            ok: true,
            text: nl
              ? `${check.total === 1 ? "De Mollie-uitbetaling is" : `Alle ${check.total} Mollie-uitbetalingen zijn`} afgevinkt tegen het uittreksel.`
              : `All ${check.total} Mollie payouts are checked against the bank statement.`,
          }
        : {
            ok: false,
            text:
              (nl
                ? `${check.checked} van de ${check.total} Mollie-uitbetalingen afgevinkt tegen het uittreksel`
                : `${check.checked} of ${check.total} Mollie payouts checked against the bank statement`) +
              (check.changed
                ? nl
                  ? `; bij ${check.changed} veranderde het bedrag na het afvinken.`
                  : `; ${check.changed} changed after checking.`
                : "."),
          };
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
