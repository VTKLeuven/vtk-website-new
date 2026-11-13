import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { begrotingSheets, findBegrotingLine, sheetForPost } from '@/lib/bo/budget/begroting';
import { overviewOf, resultOverviewOf, sectionAmount, type CalcContext } from '@/lib/bo/budget/calc';
import { checksOf } from '@/lib/bo/budget/checks';
import { applyFormulas, evalFormula } from '@/lib/bo/budget/formula';
import { potOf, type PotMember } from '@/lib/bo/budget/pot';
import { acceptCheckedPrice, checkableRows, checkFromLookup, isUncheckableShopLink } from '@/lib/bo/budget/prices';
import { budgetContentSchema } from '@/lib/bo/budget/schema';
import { budgetFileName } from '@/lib/bo/budget/sheet';
import { newId, templateContent } from '@/lib/bo/budget/templates';
import { BUDGET_TEMPLATES, DEFAULT_SETTINGS, type CostRow, type CostSection } from '@/lib/bo/budget/types';
import { parseBrowserAnswer, parseShopUrl, shopOfUrl } from '@/lib/priceCheck/shops';

/*
 * Wat de bladen van 26-27 deden en de site eerst niet kon: een rekensom in een
 * cel, eigen parameters, een resultaat naast het budget, een begrotingslijn
 * met meer dan één budget erop, en prijzen bij meer winkels dan Collect&Go.
 */

const ctx: CalcContext = { postKey: 'g:test', settings: DEFAULT_SETTINGS };
const scope = { deelnemers: 150, aantalbedrijven: 14 };

describe('berekeningen in een getalveld', () => {
  it('rekent zoals de cellen in de bladen', () => {
    const cases: [string, number][] = [
      ['=2,79/4', 0.6975],
      ['=5+1+2+2+7', 17],
      ['=97.47*1.21', 117.9387],
      ['=-10-22,92', -32.92],
      ['=omhoog(45/6)', 8],
      ['=ROUNDUP(45/6;0)', 8],
      ['=[Aantal bedrijven]*2+8', 36],
      ['=aantal_bedrijven*2+8', 36],
      ['=30%*Deelnemers', 45],
      ['=1.215,50*2', 2431],
      ['=max(190;Deelnemers+[Aantal bedrijven]*2)', 190],
      ['=omlaag(150*0,805)', 120],
    ];
    for (const [formula, value] of cases) {
      const r = evalFormula(formula, scope);
      expect(r, formula).toMatchObject({ ok: true });
      if (r.ok) expect(r.value, formula).toBeCloseTo(value, 6);
    }
  });

  it('zegt wat er mis is in plaats van een getal te verzinnen', () => {
    expect(evalFormula('=1/0', scope)).toEqual({ ok: false, error: 'delen door nul' });
    expect(evalFormula('=[Bestaat niet]*2', scope)).toMatchObject({ ok: false });
    expect(evalFormula('=(1+2', scope)).toMatchObject({ ok: false });
    expect(evalFormula('=IF(A1;2;3)', scope)).toMatchObject({ ok: false });
    expect(evalFormula('=', scope)).toMatchObject({ ok: false });
  });

  it('werkt een gewijzigde parameter door in elke regel die ernaar verwijst', () => {
    const content = templateContent('sectornight', true);
    content.params.persons = 150;
    content.params.extra![0].value = 14; // Aantal bedrijven
    content.params.extra![2].value = 800; // Prijs deelname bedrijf
    const catering = content.sections[2] as CostSection;
    catering.rows.push({ id: newId(), name: 'Broodjes', perPerson: 2, perUnit: 1, price: 1.5, basis: null });
    expect(applyFormulas(content)).toEqual([]);
    expect(sectionAmount(content, ctx, content.sections[0])).toBe(11200);
    // 150 studenten + 14 bedrijven × 2 vertegenwoordigers, elk twee broodjes.
    expect(catering.base).toBe(178);
    expect(sectionAmount(content, ctx, catering)).toBeCloseTo(178 * 2 * 1.5, 6);
    content.params.extra![0].value = 10;
    applyFormulas(content);
    expect(sectionAmount(content, ctx, content.sections[0])).toBe(8000);
    expect(budgetContentSchema.safeParse(content).success).toBe(true);
  });

  it('meldt een kapotte berekening als punt dat het indienen tegenhoudt', () => {
    const content = templateContent('standaard', true);
    (content.sections[1] as CostSection).rows.push({
      id: 'r1',
      name: 'Pennen',
      qty: 1,
      fx: { qty: '=[Weg]*2' },
      price: 2,
      basis: 'incl',
      source: { type: 'afspraak', note: 'x' },
    });
    const checks = checksOf(content, ctx, true);
    expect(checks.some((c) => c.level === 'block' && c.rowId === 'r1' && /Berekening/.test(c.text))).toBe(true);
    // De controles rekenen op een kopie: het budget zelf blijft zoals het was.
    expect((content.sections[1] as CostSection).rows[0].qty).toBe(1);
  });

  it('elk sjabloon is een geldig budget', () => {
    for (const template of BUDGET_TEMPLATES) {
      const content = templateContent(template, true);
      expect(applyFormulas(content), template).toEqual([]);
      expect(budgetContentSchema.safeParse(content).success, template).toBe(true);
    }
  });
});

describe('resultaat naast het budget', () => {
  it('telt de ingevulde resultaten en vergelijkt met budget en begroting', () => {
    const content = templateContent('standaard', true);
    content.begroting = -300;
    (content.sections[0] as { rows: unknown[] }).rows.push({
      id: 'i1',
      name: 'Tickets',
      count: { type: 'manual', qty: 40 },
      price: { type: 'manual', value: 5 },
      result: 180,
    });
    (content.sections[1] as CostSection).rows.push(
      { id: 'c1', name: 'Zaal', qty: 1, price: 400, basis: null, result: 400 },
      { id: 'c2', name: 'Drank', qty: 10, price: 9, basis: null, result: null }
    );
    content.result = { on: true };
    expect(overviewOf(content, ctx).total).toBe(200 - 490);
    const r = resultOverviewOf(content, ctx);
    expect(r.total).toBe(180 - 400);
    expect(r.diffBudget).toBe(70);
    expect(r.diffBegroting).toBe(80);
    // Eén regel met een bedrag heeft nog geen resultaat: dat zegt de site.
    expect(checksOf(content, ctx, true).some((c) => /nog geen resultaat/.test(c.text))).toBe(true);
    expect(budgetFileName('26-27', 'Sport', 'Vijfkamp', true)).toBe('26-27_Resultaat_Sport_Vijfkamp.xlsx');
  });
});

describe('een potje: meer budgetten op één lijn van de begroting', () => {
  const member = (id: string, total: number, result: number | null, targetDate: string): PotMember => ({
    id,
    title: id,
    postKey: 'g:test',
    status: 'DRAFT',
    targetDate,
    total,
    result,
  });

  it('telt de anderen samen; zonder resultaat telt het budget', () => {
    const pot = potOf(
      [
        member('b', -400, null, '2026-10-11'),
        member('a', -550, -540, '2026-09-11'),
        member('self', -100, null, '2026-11-01'),
      ],
      'self'
    );
    expect(pot.others.map((m) => m.id)).toEqual(['a', 'b']);
    expect(pot.othersTotal).toBe(-950);
    expect(pot.othersResult).toBe(-940);
  });

  it('vergelijkt het hele potje met de begroting', () => {
    const content = templateContent('standaard', true);
    content.begroting = -1000;
    (content.sections[1] as CostSection).rows.push({ id: 'c', name: 'Kabels', qty: 1, price: 100, basis: null });
    expect(overviewOf(content, ctx).diff).toBe(900);
    const withPot = { ...ctx, pot: { others: -950, othersResult: -940, count: 2 } };
    expect(overviewOf(content, withPot).diff).toBe(-50);
    expect(checksOf(content, withPot, true).some((c) => /potje/.test(c.text) && c.level === 'review')).toBe(true);
  });
});

describe('de begroting uit het rekenblad', () => {
  it('leest lijnen per tabblad, met het kopje erboven', async () => {
    const cell = (value: string | number | null) => (value == null ? null : { value });
    const sheet = [
      [null, cell('Begroting')],
      [],
      [],
      [cell(100), cell('Beschrijving'), null, null, cell('Aantal'), cell('Eenheidsbedrag'), null, null, cell('Totaal')],
      [],
      [null, cell('Cantussen'), null, null, null, null, null, null, cell(-2605.32)],
      [cell(10001), cell('Openingscantus'), null, null, cell(1), cell(-1250.32), null, null, cell(-1250.32)],
      [cell(10001), cell('12-urencantus'), null, null, cell(1), cell(-1355), null, null, cell(-1355)],
      [],
      [null, cell('Sponsoring'), null, null, null, null, null, null, cell(500)],
    ];
    const buffer = await writeXlsxFile([
      { sheet: 'Activiteiten', data: sheet },
      { sheet: 'Overzicht', data: [[cell('Overzicht')]] },
    ]).toBuffer();
    const sheets = begrotingSheets(Buffer.from(buffer));
    if ('error' in sheets) throw new Error(sheets.error);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].lines).toEqual([
      { key: 'cantussen/openingscantus', group: 'Cantussen', name: 'Openingscantus', amount: -1250.32 },
      { key: 'cantussen/12urencantus', group: 'Cantussen', name: '12-urencantus', amount: -1355 },
      // Een kopje met een bedrag en zonder lijnen eronder is zelf de lijn.
      { key: '/sponsoring', group: '', name: 'Sponsoring', amount: 500 },
    ]);
    const begroting = { fileName: 'b.xlsx', uploadedAt: '2026-11-13', sheets };
    expect(sheetForPost(begroting, 'Activiteiten')).toBe('Activiteiten');
    expect(
      findBegrotingLine(begroting, { sheet: 'Activiteiten', key: 'cantussen/12urencantus', label: '' })?.amount
    ).toBe(-1355);
    expect(begrotingSheets(Buffer.from('geen xlsx'))).toEqual({ error: 'UNREADABLE' });
  });
});

describe('prijzen bij de webshops', () => {
  it('herkent één product bij de winkels uit de bladen, en niets anders', () => {
    expect(parseShopUrl('https://www.bol.com/be/nl/p/dula-etiketten/9300000038335239/?cid=1')).toMatchObject({
      shop: 'bol',
      page: 'https://www.bol.com/be/nl/p/dula-etiketten/9300000038335239/',
    });
    expect(
      parseShopUrl('https://www.partywinkel.be/products/kale-kop-pruik-gabber?variant=49447967129892&utm_source=x')
    ).toMatchObject({
      via: 'browser',
      page: 'https://www.partywinkel.be/products/kale-kop-pruik-gabber?variant=49447967129892',
    });
    expect(
      parseShopUrl('https://www.helloprint.com/nl-be/brochuresgarenloos-a5-52-matt-170s-300gcgl10-250-days6')
    ).toMatchObject({ shop: 'helloprint', basis: 'excl' });
    expect(parseShopUrl('https://www.action.com/nl-be/p/3208221/euromunten/')).toMatchObject({ shop: 'action' });
    // Een categorie heeft een vanaf-prijs, geen prijs van wat de post bestelt.
    expect(parseShopUrl('https://www.helloprint.com/nl-be/posters')).toBeNull();
    // Colruyt geeft een prijs per winkel: langs de prijsbrowser, met de postcode uit de instellingen.
    expect(shopOfUrl('https://www.colruyt.be/nl/producten/38672')).toBe('colruyt');
    expect(parseShopUrl('https://www.colruyt.be/nl/producten/everyday-doekjes-38672?x=1')).toMatchObject({
      via: 'browser',
      page: 'https://www.colruyt.be/nl/producten/38672',
    });
    expect(parseShopUrl('https://www.colruyt.be/nl/producten')).toBeNull();
    // De host telt, niet wat er verder in het adres staat.
    expect(parseShopUrl('https://evil.example/www.bol.com/be/nl/p/x/9300000038335239/')).toBeNull();
    expect(parseShopUrl('https://bol.com.evil.example/be/nl/p/x/9300000038335239/')).toBeNull();
    expect(parseShopUrl('javascript:alert(1)')).toBeNull();
  });

  it('leest wat de prijsbrowser teruggeeft, met de prijs van de gekozen variant', () => {
    const ref = parseShopUrl('https://www.partywinkel.be/products/pruik?variant=222222')!;
    expect(ref).toMatchObject({ via: 'browser', page: 'https://www.partywinkel.be/products/pruik?variant=222222' });
    const ld =
      '{"@context":"https://schema.org","@type":"Product","name":"Pruik","offers":[{"price":"4.30"},{"price":"4.95"}]}';
    const answer = { status: 200, finalUrl: ref.page, title: 'Pruik', ld: [ld], price: '€4,95' };
    // De metatag is de gekozen variant; de JSON-LD somt ze allemaal op.
    expect(parseBrowserAnswer(ref, answer)).toMatchObject({ name: 'Pruik', price: 4.95 });
    expect(parseBrowserAnswer(ref, { ...answer, price: null })).toMatchObject({ price: 4.3 });
    // Een botcontrole heeft geen product: dat wordt "geen antwoord", geen prijs.
    expect(parseBrowserAnswer(ref, { ...answer, title: 'Even geduld...', ld: [], price: null })).toBeNull();
    expect(parseShopUrl('https://www.collectandgo.be/nl/assortiment/cola-zero')).toMatchObject({ via: 'fetch' });
  });

  it('vergelijkt een prijs excl. BTW van een drukker met de regel', () => {
    const url = 'https://www.helloprint.com/nl-be/brochuresgarenloos-a5-52-matt-170s-300gcgl10-250-days6';
    const row: CostRow = {
      id: 'r',
      name: 'Guides',
      qty: 1,
      price: 612.25,
      basis: 'incl',
      productVat: 0.21,
      source: { type: 'webshop', url },
    };
    const found = {
      status: 'found' as const,
      product: { name: 'Brochures', price: 505.99, available: true },
      basis: 'excl' as const,
      shop: 'helloprint',
    };
    // 505,99 excl. is 612,25 incl. 21 %: dezelfde prijs.
    expect(checkFromLookup(row, found, '2026-11-13T10:00:00Z').status).toBe('ok');
    const changed = checkFromLookup({ ...row, price: 580 }, found, '2026-11-13T10:00:00Z');
    expect(changed).toMatchObject({ status: 'changed', price: 505.99, basis: 'excl', shop: 'helloprint' });
    const accepted: CostRow = { ...row, price: 580, fx: { price: '=1160/2' }, lastCheck: changed };
    acceptCheckedPrice(accepted, '2026-11-13');
    expect(accepted).toMatchObject({ price: 505.99, basis: 'excl', checkedAt: '2026-11-13' });
    expect(accepted.fx).toBeUndefined();

    const content = templateContent('standaard', true);
    (content.sections[1] as CostSection).rows.push(
      row,
      {
        id: 'z',
        name: 'Cola',
        qty: 1,
        price: 1,
        source: { type: 'collectgo', url: 'https://www.collectandgo.be/colruyt/nl/assortiment/zoek?searchTerm=cola' },
      },
      { id: 'y', name: 'Hamer', qty: 1, price: 9, source: { type: 'webshop', url: 'https://www.gamma.be/nl/p/hamer' } }
    );
    expect(checkableRows(content).map((r) => r.rowId)).toEqual(['r']);
    const rows = (content.sections[1] as CostSection).rows;
    expect(isUncheckableShopLink(rows[1])).toBe(true);
    // Een winkel die de site niet kent, is geen fout in de link.
    expect(isUncheckableShopLink(rows[2])).toBe(false);
  });
});
