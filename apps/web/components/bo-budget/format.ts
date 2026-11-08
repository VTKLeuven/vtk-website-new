/*
 * Getallen zoals een penning ze typt en leest: komma als decimaalteken, een
 * echt minteken, en bedragen altijd met twee cijfers na de komma.
 */

function locale(nl: boolean) {
  return nl ? 'nl-BE' : 'en-GB';
}

function half(n: number): number {
  return ((Math.sign(n) || 1) * Math.round(Math.abs(n) * 100 + 1e-7)) / 100;
}

/** "1.167,36", met "−" voor een negatief bedrag. */
export function money(n: number | null | undefined, nl = true): string {
  if (n == null || Number.isNaN(n)) return '–';
  const v = half(n);
  const s = new Intl.NumberFormat(locale(nl), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.abs(v)
  );
  return (v < 0 ? '−' : '') + s;
}

export function euro(n: number | null | undefined, nl = true): string {
  return n == null || Number.isNaN(n) ? '–' : `€ ${money(n, nl)}`;
}

/** "+47,65" of "−490,00"; het plusteken blijft bij het getal. */
export function signedMoney(n: number | null | undefined, nl = true): string {
  if (n == null || Number.isNaN(n)) return '–';
  const v = half(n);
  return (v > 0 ? '+⁠' : '') + money(v, nl);
}

/** "80,5 %" voor 0,805. */
export function percent(x: number | null | undefined, nl = true): string {
  if (x == null || Number.isNaN(x)) return '–';
  return `${new Intl.NumberFormat(locale(nl), { maximumFractionDigits: 2 }).format(Math.round(x * 100000) / 1000)} %`;
}

/** Een getal zonder overbodige nullen: "10", "0,3", "4,29". */
export function plain(n: number | null | undefined, nl = true, max = 4): string {
  if (n == null || Number.isNaN(n)) return '';
  return new Intl.NumberFormat(locale(nl), { maximumFractionDigits: max, useGrouping: false }).format(n);
}

/** Wat iemand intypt: "1.215,50", "1215.5", "€ 6,95", "−3". */
export function parseNumber(input: string): number | null {
  let t = input
    .trim()
    .replace(/[\s€% ]/g, '')
    .replace(/−/g, '-');
  if (t === '' || t === '-' || t === ',') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function shortDate(iso: string | null | undefined, nl = true): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(nl), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
}
