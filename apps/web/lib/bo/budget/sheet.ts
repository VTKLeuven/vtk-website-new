import type { Cell, CellObject, SheetData } from 'write-excel-file/node';
import { normalizeKey } from '../names';
import {
  costAmount,
  distributionOf,
  incomeAmount,
  incomeCount,
  incomePrice,
  overviewOf,
  priceOf,
  rowPct,
  toCents,
  unitsOf,
  type CalcContext,
} from './calc';
import type { BudgetContent, CostRow, CostSection, IncomeSection } from './types';

/*
 * Een budget van de site als rekenblad, om in de map Budgetten van een BO te
 * zetten. Zolang het BO met de bladen in Drive werkt, is dat de brug: de post
 * stelt het op de site op, en Drive blijft de bron.
 *
 * Het blad volgt het sjabloon van de penning, zodat de scan het leest zoals
 * elk ander budget (`figures.ts`): bovenaan "Overzicht" met de kolommen Budget
 * en Resultaat, de regels Inkomsten, Uitgaven, Totaal en Begroting, en rechts
 * het blok Info met Datum, Locatie en Verdeling. Enkel waarden, geen formules:
 * een xlsx die niet door Sheets of Excel opende, heeft geen berekende waarden,
 * en dan zou de scan "openen" tonen in plaats van een bedrag.
 */

const EURO = '#,##0.00';
const PCT = '0.##%';

/** Labels die in het blok Overzicht iets betekenen; een sectie met die naam krijgt een toevoeging. */
const RESERVED = new Set([
  'overzicht',
  'budget',
  'resultaat',
  'inkomsten',
  'uitgaven',
  'totaal',
  'begroting',
  'verschil met begroting',
  'verschil met budget',
]);

function sectionLabel(name: string, nl: boolean): string {
  const clean = name.trim() || (nl ? 'Zonder naam' : 'Unnamed');
  return RESERVED.has(normalizeKey(clean)) ? `${clean} (${nl ? 'regels' : 'rows'})` : clean;
}

function text(value: string, style: CellObject = {}): CellObject {
  return { value, type: String, ...style };
}

/** Op de cent, de helft weg van nul zoals de site toont, zodat de scan hetzelfde bedrag leest. */
function euro(value: number, style: CellObject = {}): CellObject {
  return { value: toCents(value) / 100, type: Number, format: EURO, ...style };
}

function num(value: number): CellObject {
  return { value, type: Number };
}

const bold: CellObject = { fontWeight: 'bold' };
const head: CellObject = { fontWeight: 'bold', backgroundColor: '#E6ECF5' };

function row(cells: Array<Cell | undefined>, width: number): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < width; i += 1) out.push(cells[i] ?? null);
  return out;
}

function sourceText(content: BudgetContent, r: CostRow, nl: boolean): string {
  if (r.service) return nl ? 'Collect&Go-servicekost (instellingen)' : 'Collect&Go service cost';
  if (r.forfait) return `${nl ? 'Forfait' : 'Lump sum'}: ${r.forfait.reason}`;
  const s = r.source;
  if (!s) return '';
  if (s.type === 'locatie')
    return `${nl ? 'Locatie' : 'Venue'} ${content.info.location.trim()}${r.override != null ? ` (${nl ? 'afwijkend' : 'different'}: ${r.overrideReason ?? ''})` : ''}`;
  return [s.url, s.note].filter(Boolean).join(' ');
}

function vatText(r: CostRow, nl: boolean): string {
  if (r.service) return nl ? 'incl. 21 %' : 'incl. 21 %';
  if (!r.basis) return '';
  return r.basis === 'incl' ? `incl. ${Math.round((r.productVat ?? 0.21) * 1000) / 10} %` : nl ? 'excl.' : 'excl.';
}

export type BudgetSheetMeta = { title: string; postName: string; year: string; madeOn: string; nl: boolean };

export function budgetSheet(content: BudgetContent, ctx: CalcContext, meta: BudgetSheetMeta) {
  const { nl } = meta;
  const W = 11;
  const o = overviewOf(content, ctx);
  const data: SheetData = [];

  data.push(row([text(meta.postName, bold), null, text(meta.title, bold)], W));
  data.push(
    row(
      [
        text(
          nl
            ? `Opgesteld op vtk.be op ${meta.madeOn}. Wijzig het budget op de site en download het opnieuw; dit blad is een momentopname.`
            : `Drawn up on vtk.be on ${meta.madeOn}. Change the budget on the site and download it again; this sheet is a snapshot.`,
          { textColor: '#5C667F' }
        ),
      ],
      W
    )
  );
  data.push(row([], W));

  // Het blok Overzicht (A tot D) met rechts het blok Info (F tot H).
  const info: Array<Array<Cell | undefined>> = [
    [text('Info', head), null, null],
    [
      text(nl ? 'Datum' : 'Date', bold),
      text(nl ? 'Locatie' : 'Venue', bold),
      text(nl ? 'Verantwoordelijke' : 'Responsible', bold),
    ],
    [
      text(content.info.date ? content.info.date.split('-').reverse().join('/') : ''),
      text(content.info.location.trim()),
      text(meta.postName),
    ],
    [],
    [text(nl ? 'Concept' : 'Concept', bold)],
    [text(content.info.concept)],
    [],
    [text(nl ? 'Organisatie' : 'Organisation', bold), text(nl ? 'Verdeling' : 'Split', bold)],
    ...content.allocation.map((a) => [text(a.org), { value: a.share, type: Number, format: PCT } as CellObject]),
  ];
  const overview: Array<Array<Cell | undefined>> = [
    [text(nl ? 'Overzicht' : 'Overview', head), null, text('Budget', head), text(nl ? 'Resultaat' : 'Resultaat', head)],
    ...o.lines.filter((l) => l.side === 'in').map((l) => [text(sectionLabel(l.name, nl)), null, euro(l.amount)]),
    [text(nl ? 'Inkomsten' : 'Inkomsten', bold), null, euro(o.income, bold)],
    ...o.lines.filter((l) => l.side === 'out').map((l) => [text(sectionLabel(l.name, nl)), null, euro(l.amount)]),
    [text(nl ? 'Uitgaven' : 'Uitgaven', bold), null, euro(o.expense, bold)],
    [],
    [text(nl ? 'Totaal' : 'Totaal', bold), null, euro(o.total, bold)],
    [text(nl ? 'Begroting' : 'Begroting'), null, o.begroting == null ? null : euro(o.begroting)],
    [text(nl ? 'Verschil met begroting' : 'Verschil met begroting'), null, o.diff == null ? null : euro(o.diff)],
  ];
  for (let i = 0; i < Math.max(info.length, overview.length); i += 1) {
    const left = overview[i] ?? [];
    const right = info[i] ?? [];
    data.push(row([left[0], left[1], left[2], left[3], null, right[0], right[1], right[2]], W));
  }

  // De secties, elk met hun regels, onder het overzicht.
  for (const section of content.sections) {
    data.push(row([], W));
    if (section.type === 'income') {
      data.push(
        row(
          [
            text(sectionLabel(section.name, nl), head),
            text(nl ? 'Naam' : 'Name', head),
            text(nl ? 'Aantal' : 'Qty', head),
            text(nl ? 'Prijs' : 'Price', head),
            text(nl ? 'Bedrag' : 'Amount', head),
            text(nl ? 'Opmerking' : 'Note', head),
          ],
          W
        )
      );
      for (const r of (section as IncomeSection).rows) {
        data.push(
          row(
            [
              null,
              text(r.name),
              num(incomeCount(content, r)),
              euro(incomePrice(content, r)),
              euro(incomeAmount(content, r)),
              text(r.note ?? ''),
            ],
            W
          )
        );
      }
      continue;
    }
    const s = section as CostSection;
    if (s.type === 'fixed') {
      data.push(
        row(
          [
            text(sectionLabel(s.name, nl), head),
            text(nl ? 'Naam' : 'Name', head),
            text(nl ? 'Aantal' : 'Qty', head),
            text(nl ? 'Prijs' : 'Price', head),
            text('BTW', head),
            text(nl ? 'Bedrag' : 'Amount', head),
            text(nl ? 'Bron' : 'Source', head),
            text(nl ? 'Opmerking' : 'Note', head),
          ],
          W
        )
      );
      for (const r of s.rows) {
        data.push(
          row(
            [
              null,
              text(r.name),
              r.forfait ? null : num(r.qty ?? 0),
              r.forfait ? null : euro(priceOf(content, ctx, r)),
              text(vatText(r, nl)),
              euro(costAmount(content, ctx, s, r)),
              text(sourceText(content, r, nl)),
              text(r.note ?? ''),
            ],
            W
          )
        );
      }
      continue;
    }
    const d = s.distribute ? distributionOf(s) : null;
    data.push(
      row(
        [
          text(sectionLabel(s.name, nl), head),
          text(nl ? 'Naam' : 'Name', head),
          text(nl ? 'Deel' : 'Share', head),
          text(nl ? 'Per persoon' : 'Per person', head),
          text(nl ? 'Per eenheid' : 'Per unit', head),
          text(nl ? 'Eenheden' : 'Units', head),
          text(nl ? 'Prijs' : 'Price', head),
          text('BTW', head),
          text(nl ? 'Bedrag' : 'Amount', head),
          text(nl ? 'Bron' : 'Source', head),
          text(nl ? 'Opmerking' : 'Note', head),
        ],
        W
      )
    );
    for (const r of s.rows) {
      data.push(
        row(
          [
            null,
            text(r.mixOf ? `${r.name} (mix)` : r.name),
            d ? { value: rowPct(s, r), type: Number, format: PCT } : null,
            r.rest || r.forfait ? null : num(r.perPerson ?? s.perPerson ?? 1),
            r.rest || r.forfait ? null : num(r.perUnit ?? 0),
            r.rest || r.forfait ? null : num(unitsOf(content, s, r)),
            r.rest || r.forfait ? null : euro(priceOf(content, ctx, r)),
            text(vatText(r, nl)),
            euro(costAmount(content, ctx, s, r)),
            text(
              r.rest
                ? nl
                  ? 'De rest van de verdeling, geen aankoop'
                  : 'The rest of the split, nothing bought'
                : sourceText(content, r, nl)
            ),
            text(r.note ?? ''),
          ],
          W
        )
      );
    }
  }

  return [
    {
      sheet: 'BUDGET - overzicht',
      data,
      columns: [
        { width: 26 },
        { width: 34 },
        { width: 12 },
        { width: 13 },
        { width: 12 },
        { width: 14 },
        { width: 14 },
        { width: 18 },
        { width: 12 },
        { width: 40 },
        { width: 30 },
      ],
    },
  ];
}

/** "26-27_Budget_Activiteiten_Live Cantus.xlsx", zoals de scan een budget herkent. */
export function budgetFileName(year: string, postName: string, title: string): string {
  const clean = (s: string) =>
    s
      .replace(/[\\/:*?"<>|_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${year}_Budget_${clean(postName)}_${clean(title) || 'Budget'}.xlsx`;
}
