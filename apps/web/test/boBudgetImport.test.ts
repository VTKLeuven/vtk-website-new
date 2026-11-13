import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { overviewOf, resultOverviewOf, type CalcContext } from '@/lib/bo/budget/calc';
import { importBudgetWorkbook } from '@/lib/bo/budget/importSheet';
import { budgetContentSchema } from '@/lib/bo/budget/schema';
import { DEFAULT_SETTINGS, type CostSection, type IncomeSection } from '@/lib/bo/budget/types';

/*
 * Een rekenblad van het BO omzetten naar een budget op de site. Het blad
 * hieronder is nagebouwd naar het sjabloon van de penning, met verzonnen
 * cijfers: de echte bladen komen nooit in de repo. Tegen de 209 bladen van
 * 26-27 is de lezer lokaal gedraaid (november 2026): 155 kwamen regel per
 * regel binnen, 53 met het overzicht, en elk totaal klopte met het blad.
 */

type Value = string | number | null;
const ctx: CalcContext = { postKey: '', settings: DEFAULT_SETTINGS };

/** Een blad uit losse cellen: `cells["A4"] = "Overzicht"`. */
async function workbook(cells: Record<string, Value>): Promise<Buffer> {
  const rows: ({ value: string | number } | null)[][] = [];
  for (const [ref, value] of Object.entries(cells)) {
    const match = /^([A-Z])(\d+)$/.exec(ref)!;
    const col = match[1].charCodeAt(0) - 65;
    const row = Number(match[2]) - 1;
    while (rows.length <= row) rows.push([]);
    while (rows[row].length <= col) rows[row].push(null);
    rows[row][col] = value == null ? null : { value };
  }
  return Buffer.from(await writeXlsxFile(rows, { sheet: 'BUDGET - overzicht' }).toBuffer());
}

const HEAD = {
  A1: 'Sport',
  C1: 'Voorbeeldtornooi',
  A4: 'Overzicht',
  C4: 'Budget',
  D4: 'Resultaat',
  F4: 'Parameters',
  N4: 'Info',
  F6: 'Aantal personen',
  G6: 40,
  N5: 'Datum',
  O5: 'Locatie',
  O6: 'Sportkot',
  N8: 'Concept',
  N9: 'Een tornooi met een receptie.',
};

describe('een rekenblad overnemen', () => {
  it('neemt elke regel over, met aantal, prijs, bron en resultaat', async () => {
    const buffer = await workbook({
      ...HEAD,
      A5: 'Inkom',
      C5: 200,
      D5: 180,
      A10: 'Inkomsten',
      C10: 200,
      D10: 180,
      A11: 'Zaal',
      C11: 150,
      D11: 150,
      A12: 'Drank',
      C12: 57.54,
      D12: 61,
      A18: 'Uitgaven',
      C18: 207.54,
      D18: 211,
      A20: 'Totaal',
      C20: -7.54,
      D20: -31,
      A21: 'Begroting',
      C21: -50,
      A26: 'Vaste kosten/Keuzekost',
      A27: 'Zaal',
      B27: 'Naam',
      E27: 'Aantal',
      F27: 'Prijs per stuk',
      J27: 'Totaal',
      K27: 'Resultaat',
      O27: 'Opmerking/link',
      B28: 'Huur zaal',
      E28: 2,
      F28: 75,
      J28: 150,
      K28: 150,
      O28: 'Offerte van het sportkot',
      E30: 'Totaal',
      J30: 150,
      A33: 'Variabele kosten',
      A34: 'Drank',
      B34: 'Naam',
      E34: 'Percentage',
      F34: 'Aantal',
      G34: 'Per eenheid',
      H34: 'Eenheden',
      I34: 'Prijs per eenheid',
      J34: 'Totaal',
      K34: 'Resultaat',
      O34: 'Opmerking/link',
      B35: 'Cola',
      E35: 0.6,
      F35: 24,
      G35: 6,
      H35: 4,
      I35: 9.59,
      J35: 38.36,
      K35: 41,
      O35: 'https://www.collectandgo.be/nl/assortiment/coca-cola-6x1-5l',
      B36: 'Chips (met korting)',
      E36: 0.4,
      F36: 16,
      G36: 1,
      H36: 16,
      I36: 1.29,
      J36: 19.18,
      K36: 20,
      E37: 'Totaal',
      J37: 57.54,
      A40: 'Inkomsten',
      A41: 'Inkom',
      B41: 'Naam',
      F41: 'Aantal',
      G41: 'Prijs per stuk',
      J41: 'Totaal',
      K41: 'Resultaat',
      B42: 'Deelnemers',
      F42: 40,
      G42: 5,
      J42: 200,
      K42: 180,
    });
    const imported = importBudgetWorkbook(buffer, {
      fileName: '26-27_Resultaat_Sport_Voorbeeldtornooi.xlsx',
      kind: 'upload',
    });
    if ('error' in imported) throw new Error(imported.error);
    const { content } = imported;
    expect(imported).toMatchObject({
      mode: 'regels',
      hasResult: true,
      sheetPost: 'Sport',
      sheetTitle: 'Voorbeeldtornooi',
    });
    expect(budgetContentSchema.safeParse(content).success).toBe(true);
    expect(overviewOf(content, ctx).total).toBeCloseTo(-7.54, 6);
    expect(resultOverviewOf(content, ctx).total).toBeCloseTo(-31, 6);
    expect(content.begroting).toBe(-50);
    expect(content.params.persons).toBe(40);
    expect(content.info).toMatchObject({ location: 'Sportkot', concept: 'Een tornooi met een receptie.' });
    expect(content.source).toMatchObject({ kind: 'upload', mode: 'regels', sheetTotal: -7.54 });

    const [zaal, drank, inkom] = content.sections as [CostSection, CostSection, IncomeSection];
    expect(zaal.rows[0]).toMatchObject({ name: 'Huur zaal', qty: 2, price: 75, result: 150 });
    expect(zaal.rows[0].source).toEqual({ type: 'afspraak', note: 'Offerte van het sportkot' });
    // Een variabele regel komt binnen als haar uitkomst: de eenheden tegen de prijs.
    expect(drank.rows[0]).toMatchObject({ name: 'Cola', qty: 4, price: 9.59, result: 41 });
    expect(drank.rows[0].source).toMatchObject({ type: 'collectgo' });
    // 16 × 1,29 is geen 19,18: dan telt het bedrag van het blad, als forfait met uitleg.
    expect(drank.rows[1].forfait).toMatchObject({ amount: 19.18 });
    expect(inkom.type).toBe('income');
    expect(inkom.rows[0]).toMatchObject({ name: 'Deelnemers', count: { type: 'manual', qty: 40 }, result: 180 });
  });

  it('valt terug op het overzicht wanneer de regels niet op het totaal van het blad uitkomen', async () => {
    // Een eigen indeling zonder secties met "Naam": enkel het overzicht is te lezen.
    const buffer = await workbook({
      ...HEAD,
      A5: "Drankpromo's",
      C5: -60.27,
      A6: 'Inkleding',
      C6: -187.69,
      A15: 'Totaal',
      C15: -247.96,
      A16: 'Begroting',
      C16: -300,
    });
    const imported = importBudgetWorkbook(buffer, { fileName: 'x.xlsx', kind: 'drive', fileId: 'abc' });
    if ('error' in imported) throw new Error(imported.error);
    expect(imported.mode).toBe('overzicht');
    expect(imported.content.source).toMatchObject({ kind: 'drive', id: 'abc', mode: 'overzicht' });
    // Negatieve posten zonder regel "Inkomsten" zijn kosten, geen negatieve inkomsten.
    expect(imported.content.sections.map((s) => s.type)).toEqual(['fixed']);
    expect(overviewOf(imported.content, ctx).total).toBeCloseTo(-247.96, 6);
    expect(budgetContentSchema.safeParse(imported.content).success).toBe(true);
  });

  it('zegt het wanneer een bestand geen budgetblad is', async () => {
    expect(importBudgetWorkbook(Buffer.from('geen xlsx'), { fileName: 'a.xlsx', kind: 'upload' })).toEqual({
      error: 'UNREADABLE',
    });
    const loose = await workbook({ A1: 'Zomaar een lijstje', A2: 12 });
    expect(importBudgetWorkbook(loose, { fileName: 'b.xlsx', kind: 'upload' })).toEqual({ error: 'NO_OVERVIEW' });
  });
});
