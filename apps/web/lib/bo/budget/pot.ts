/*
 * Een potje: één lijn uit de begroting waar meer dan één budget op zit.
 * "Materiaal Logistiek" is één bedrag voor het hele jaar, en Logistiek brengt
 * er door het jaar vier budgetten op (Elektriciteit, Overig, Werkgereedschap,
 * Opslagmateriaal), elk met een eigen resultaat. In de bladen stond in elk van
 * die vier de hele begroting, en hield iemand in zijn hoofd bij hoeveel er nog
 * over was.
 *
 * Twee budgetten horen bij hetzelfde potje wanneer ze dezelfde lijn kozen
 * (`BudgetContent.begrotingRef`), in hetzelfde werkingsjaar. Puur: de lijst
 * komt binnen, hier wordt enkel geteld.
 */

export type PotMember = {
  id: string;
  title: string;
  postKey: string;
  status: 'DRAFT' | 'SUBMITTED';
  targetDate: string | null;
  /** Het totaal van het budget in euro; een kost is negatief. */
  total: number;
  /** Het resultaat tot nu toe, of null als er nog geen is. */
  result: number | null;
};

export type Pot = {
  /** De andere budgetten op dezelfde lijn, het oudste BO eerst. */
  others: PotMember[];
  othersTotal: number;
  /** Het resultaat van de anderen; wie nog geen resultaat heeft, telt met zijn budget. */
  othersResult: number;
};

export function potKey(ref: { sheet: string; key: string } | null | undefined): string | null {
  return ref ? `${ref.sheet}\u0000${ref.key}` : null;
}

export function potOf(members: readonly PotMember[], selfId: string): Pot {
  const others = members
    .filter((m) => m.id !== selfId)
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.title.localeCompare(b.title));
  return {
    others,
    othersTotal: others.reduce((sum, m) => sum + m.total, 0),
    othersResult: others.reduce((sum, m) => sum + (m.result ?? m.total), 0),
  };
}
