/** Maanden en periodes in woorden, voor de schermen en de bestanden van /admin/inkomsten. */

const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" -> "oktober 2026". */
export function monthLabel(month: string, nl: boolean): string {
  const [year, m] = month.split("-").map(Number);
  return `${(nl ? MONTHS_NL : MONTHS_EN)[m - 1]} ${year}`;
}

/** "juli tot september 2026", of één maand. */
export function periodLabel(from: string, to: string, nl: boolean): string {
  if (from === to) return monthLabel(from, nl);
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear] = to.split("-").map(Number);
  const start = fromYear === toYear ? (nl ? MONTHS_NL : MONTHS_EN)[fromMonth - 1] : monthLabel(from, nl);
  return `${start} ${nl ? "tot" : "to"} ${monthLabel(to, nl)}`;
}
