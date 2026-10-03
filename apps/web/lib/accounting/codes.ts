/**
 * Boekhoudcodes: de pure kant (invoer lezen, sorteren, tonen). Zonder prisma,
 * zodat ze in een clientcomponent mag en zonder database te testen is. De
 * queries staan in `server.ts`.
 *
 * Een hoofdrekening heeft zes cijfers ("700100"); een subcode is die code met
 * vijf cijfers erachter ("700100" + "10002" = "70010010002"). Zo staat ze ook
 * in de betaalinfo, en zo kent de boekhouder ze.
 */

export const MAIN_CODE_DIGITS = 6;
export const SUB_CODE_DIGITS = 5;
export const MAX_ACCOUNTING_NAME = 120;

/**
 * De code van het lidgeld. Het lidmaatschap valt hierop terug zolang er in
 * /admin/leden geen andere gekozen is, zodat er vanaf de eerste betaling een
 * code meegaat.
 */
export const MEMBERSHIP_DEFAULT_ACCOUNTING_CODE = "730000";

export type AccountingCodeRow = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
};

/** Een code zoals ze in een keuzelijst staat: subcodes ingesprongen onder hun hoofdrekening. */
export type AccountingCodeOption = AccountingCodeRow & { depth: 0 | 1 };

/**
 * Spaties en punten weg: het rekeningstelsel schrijft "700 100", en wie dat
 * overneemt hoort geen foutmelding te krijgen.
 */
export function normalizeCodeInput(raw: string): string {
  return raw.replace(/[\s.]/g, "");
}

/** Zes cijfers, of null. */
export function parseMainCode(raw: string): string | null {
  const code = normalizeCodeInput(raw);
  return new RegExp(`^\\d{${MAIN_CODE_DIGITS}}$`).test(code) ? code : null;
}

/**
 * De vijf cijfers van een subcode. Plakt iemand de volledige code
 * ("70010010002") in plaats van enkel het achterste deel, dan nemen we dat ook
 * aan zolang het met de hoofdrekening begint.
 */
export function parseSubSuffix(raw: string, parentCode: string): string | null {
  let suffix = normalizeCodeInput(raw);
  if (suffix.length === parentCode.length + SUB_CODE_DIGITS && suffix.startsWith(parentCode)) {
    suffix = suffix.slice(parentCode.length);
  }
  return new RegExp(`^\\d{${SUB_CODE_DIGITS}}$`).test(suffix) ? suffix : null;
}

/** Het achterste deel van een subcode, voor het bewerkveld. */
export function subSuffix(code: string, parentCode: string): string {
  return code.startsWith(parentCode) ? code.slice(parentCode.length) : code;
}

/** "70010010002 TD's": zo staat een code in een keuzelijst en in de statistieken. */
export function accountingCodeLabel(code: { code: string; name: string }): string {
  return `${code.code} ${code.name}`;
}

/**
 * Hoofdrekeningen op code, elk gevolgd door haar subcodes op code. Een subcode
 * waarvan de hoofdrekening ontbreekt (kan niet door de cascade, maar een lijst
 * die half binnenkomt mag niet stuk), komt achteraan als hoofdrekening.
 */
export function orderAccountingCodes(rows: readonly AccountingCodeRow[]): AccountingCodeOption[] {
  const byCode = (a: AccountingCodeRow, b: AccountingCodeRow) => a.code.localeCompare(b.code);
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string, AccountingCodeRow[]>();
  const roots: AccountingCodeRow[] = [];
  for (const row of rows) {
    if (row.parentId && ids.has(row.parentId)) {
      children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
    } else {
      roots.push(row);
    }
  }
  return roots.sort(byCode).flatMap((root) => [
    { ...root, depth: 0 as const },
    ...(children.get(root.id) ?? []).sort(byCode).map((child) => ({ ...child, depth: 1 as const })),
  ]);
}
