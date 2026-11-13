import { describe, expect, it } from 'vitest';
import {
  distributionOf,
  overviewOf,
  toCents,
  unitAmount,
  unitsOf,
  incomeCount,
  findCostRow,
  type CalcContext,
} from '@/lib/bo/budget/calc';
import { checksOf } from '@/lib/bo/budget/checks';
import { budgetContentSchema } from '@/lib/bo/budget/schema';
import { templateContent } from '@/lib/bo/budget/templates';
import {
  DEFAULT_SETTINGS,
  type BudgetContent,
  type BudgetSettings,
  type CostRow,
  type CostSection,
} from '@/lib/bo/budget/types';
import { acceptCheckedPrice, checkFromLookup } from '@/lib/bo/budget/prices';
import { budgetFileName, budgetSheet } from '@/lib/bo/budget/sheet';
import { figuresFromSheet } from '@/lib/bo/figures';
import { parseCollectGoUrl, parseProductPage } from '@/lib/collectgo/product';
import { readWorkbook } from '@/lib/praesidiumShifts/xlsx';
import writeXlsxFile from 'write-excel-file/node';

/*
 * Drie echte budgetten van BO 12 (8 november 2026), overgenomen uit hun
 * rekenblad. De site moet tot op de cent hetzelfde uitkomen als het blad,
 * behalve waar het blad zich vergiste (zie de comment bij PeMe).
 */

const WAAIBERG = {
  name: 'Waaiberg',
  capacity: 160,
  zaal: 550.2,
  vaten: 278,
  licht: 100,
  stopsel: 250,
  sangria: 7.35,
  basis: null,
  note: '',
};
const settings = (extra: Partial<BudgetSettings> = {}): BudgetSettings => ({
  ...DEFAULT_SETTINGS,
  locations: [WAAIBERG],
  ...extra,
});

function row(r: Partial<CostRow> & { id: string; name: string }): CostRow {
  return r;
}

function liveCantus(): BudgetContent {
  return {
    version: 1,
    params: { persons: 160, guests: 0, memberShare: 0.65, honoraryShare: 0.025 },
    info: { date: '2026-11-16', location: 'Waaiberg', concept: '' },
    begroting: -1215,
    vat: null,
    allocation: [{ org: 'VTK', share: 1 }],
    sections: [
      {
        id: 'inkom',
        name: 'Inkom',
        type: 'income',
        rows: [
          {
            id: 'leden',
            name: 'Leden',
            count: { type: 'audience', audience: 'leden' },
            price: { type: 'drinks', sectionId: 'drank', main: 14, rest: 5.5 },
          },
          {
            id: 'nietleden',
            name: 'Niet-leden',
            count: { type: 'audience', audience: 'nietleden' },
            price: { type: 'drinks', sectionId: 'drank', main: 17, rest: 8.5 },
          },
          {
            id: 'korting',
            name: 'Praesidiumkorting',
            count: { type: 'manual', qty: 5 },
            price: { type: 'manual', value: -3 },
          },
          {
            id: 'ereleden',
            name: 'Ereleden',
            count: { type: 'audience', audience: 'ereleden' },
            price: { type: 'manual', value: 0 },
          },
          {
            id: 'genodigden',
            name: 'Genodigden',
            count: { type: 'audience', audience: 'genodigden' },
            price: { type: 'manual', value: 13 },
          },
        ],
      },
      {
        id: 'zaal',
        name: 'Zaal',
        type: 'fixed',
        rows: [
          row({
            id: 'huur',
            name: 'Huur',
            qty: 1,
            source: { type: 'locatie', field: 'zaal' },
            override: 585.82,
            overrideReason: 'Nieuwe offerte',
          }),
          row({ id: 'licht', name: 'Licht en geluid', qty: 1, source: { type: 'locatie', field: 'licht' } }),
          row({ id: 'stopsel', name: 'Stopselgeld', qty: 0, source: { type: 'locatie', field: 'stopsel' } }),
          row({ id: 'pd', name: 'PD', qty: 1, price: 100, source: { type: 'afspraak', note: 'Provinciaal Depot' } }),
        ],
      },
      {
        id: 'inkleding',
        name: 'Inkleding & varia',
        type: 'fixed',
        rows: [
          row({
            id: 'chap',
            name: 'Chap revue',
            qty: 20,
            price: 6,
            basis: 'incl',
            productVat: 0.06,
            source: { type: 'webshop', url: 'https://frituurhetgrotteke.pickandgo.be/' },
          }),
          row({
            id: 'sax',
            name: 'Opblaasbare Sax',
            qty: 2,
            price: 9.59,
            basis: 'incl',
            source: { type: 'webshop', url: 'https://www.bol.com/' },
          }),
          row({
            id: 'radio',
            name: 'Opblaasbare Radio',
            qty: 2,
            price: 11.1,
            basis: 'incl',
            source: { type: 'webshop', url: 'https://www.bol.com/' },
          }),
          row({
            id: 'gitaar1',
            name: 'Opblaasbare Gitaar',
            qty: 2,
            price: 9.02,
            basis: 'incl',
            source: { type: 'webshop', url: 'https://www.bol.com/' },
          }),
          row({
            id: 'gitaar2',
            name: 'Opblaasbare gitaar',
            qty: 2,
            price: 9.11,
            basis: 'incl',
            source: { type: 'webshop', url: 'https://www.bol.com/' },
          }),
        ],
      },
      {
        id: 'drank',
        name: 'Drank',
        type: 'variable',
        distribute: true,
        rows: [
          row({
            id: 'bier',
            name: 'Bier',
            pct: 0.805,
            perPerson: 10,
            perUnit: 175,
            source: { type: 'locatie', field: 'vaten' },
          }),
          row({
            id: 'sangria',
            name: 'Sangria',
            pct: 0.0875,
            perPerson: 9,
            perUnit: 6,
            source: { type: 'locatie', field: 'sangria' },
          }),
          row({ id: 'water', name: 'Water (de rest)', rest: true }),
        ],
      },
    ],
  };
}

function itNieuwMateriaal(): BudgetContent {
  return {
    version: 1,
    params: { persons: 0 },
    info: { date: '2026-09-29', location: '', concept: '' },
    begroting: -500,
    vat: null,
    allocation: [{ org: 'VTK', share: 1 }],
    sections: [
      {
        id: 'materiaal',
        name: 'Materiaal',
        type: 'fixed',
        rows: [
          row({
            id: 'eth75',
            name: 'Ethernetkabel 75m',
            qty: 1,
            price: 64.88,
            basis: 'excl',
            source: { type: 'webshop', url: 'https://netwerkkabel.eu/' },
          }),
          row({
            id: 'eth50',
            name: 'Ethernetkabel 50m',
            qty: 1,
            price: 43.25,
            basis: 'excl',
            source: { type: 'webshop', url: 'https://netwerkkabel.eu/' },
          }),
          row({
            id: 'router',
            name: 'Outdoor Router',
            qty: 1,
            price: 119,
            basis: 'incl',
            productVat: 0.21,
            source: { type: 'webshop', url: 'https://www.bol.com/' },
          }),
          row({
            id: 'verzend',
            name: 'Verzendkosten',
            qty: 1,
            price: 5.99,
            source: { type: 'afspraak', note: 'Bij de router' },
          }),
        ],
      },
    ],
  };
}

function pemeSilentDisco(): BudgetContent {
  const cg = { type: 'collectgo' as const, url: 'https://www.collectandgo.be/' };
  const pd = (id: string, name: string, price: number) =>
    row({ id, name, qty: 1, price, source: { type: 'offerte', note: 'Goedkeuring PDL' } });
  return {
    version: 1,
    params: { persons: 90 },
    info: { date: '2026-11-26', location: 'Theokot', concept: '' },
    begroting: -500,
    vat: null,
    allocation: [{ org: 'VTK', share: 1 }],
    sections: [
      {
        id: 'ieten',
        name: 'Eten',
        type: 'income',
        rows: [
          {
            id: 'i-chipz',
            name: 'Chips Zout',
            count: { type: 'units', rowId: 'chipz' },
            price: { type: 'manual', value: 0.5 },
          },
          {
            id: 'i-chipp',
            name: 'Chips Paprika',
            count: { type: 'units', rowId: 'chipp' },
            price: { type: 'manual', value: 0.5 },
          },
        ],
      },
      {
        id: 'idrank',
        name: 'Drank',
        type: 'income',
        rows: [
          {
            id: 'i-bier',
            name: 'Bier',
            count: { type: 'consumption', rowId: 'bier' },
            price: { type: 'manual', value: 1.2 },
          },
          {
            id: 'i-wijn',
            name: 'Wijn',
            count: { type: 'consumption', rowId: 'wijn' },
            price: { type: 'manual', value: 1.5 },
          },
          {
            id: 'i-stelz',
            name: 'Stëlz',
            count: { type: 'consumption', rowId: 'stelz' },
            price: { type: 'manual', value: 2 },
          },
          {
            id: 'i-mimosa',
            name: 'Mimosa',
            count: { type: 'consumption', rowId: 'cava' },
            price: { type: 'manual', value: 1.5 },
          },
          {
            id: 'i-lim',
            name: 'Limonade orange',
            count: { type: 'consumption', rowId: 'lim' },
            price: { type: 'manual', value: 0 },
          },
        ],
      },
      {
        id: 'pd',
        name: 'PD materiaal',
        type: 'fixed',
        rows: [
          pd('xlr', 'XLR-kabelset', 0.37),
          pd('djset', 'DJ-set', 13.58),
          pd('blacklight', 'LED Blacklight', 2.1),
          pd('strobo', 'Stroboscoop', 2.7),
          pd('powflow', 'PowFlow', 3.66),
          pd('haken', 'Hakenset', 0.98),
          pd('veilig', 'Veiligheidskabel', 0.14),
          pd('brug', 'Lichtbrug', 21.56),
          pd('admin', 'Administratieve kosten', 10),
          pd('btw', 'BTW', 11.57),
        ],
      },
      {
        id: 'algemeen',
        name: 'Algemeen',
        type: 'fixed',
        rows: [
          row({ id: 'dj', name: 'DJ', qty: 3, price: 30, source: { type: 'afspraak', note: 'Vaste prijs' } }),
          row({ id: 'service', name: 'Collect&Go-servicekost', qty: 1, service: true }),
          row({ id: 'headsets', name: 'Headsets', qty: 100, price: 3.03, basis: 'incl', source: cg }),
          row({ id: 'd10', name: 'Discobal 10cm', qty: 5, price: 2.7, basis: 'incl', source: cg }),
          row({ id: 'd20', name: 'Discobal 20cm', qty: 3, price: 8.25, basis: 'incl', source: cg }),
          row({ id: 'd8', name: 'Discoballen 8cm', qty: 1, price: 8.95, basis: 'incl', source: cg }),
          row({ id: 'ballon', name: 'Ballonnen', qty: 1, price: 5.05, basis: 'incl', source: cg }),
          row({ id: 'waaier', name: 'Waaiers', qty: 2, price: 6.15, basis: 'incl', source: cg }),
          // In het blad stond hier 2,05 getypt terwijl 1 × 1,95 = 1,95.
          row({ id: 'serp', name: 'Serpentines', qty: 1, price: 1.95, basis: 'incl', source: cg }),
          row({ id: 'swirl', name: 'Swirls', qty: 2, price: 2.05, basis: 'incl', source: cg }),
          row({ id: 'gordijn', name: 'Deurgordijn', qty: 1, price: 4.1, basis: 'incl', source: cg }),
        ],
      },
      {
        id: 'alcohol',
        name: 'Alcohol',
        type: 'variable',
        distribute: true,
        share: 0.7,
        perPerson: 4,
        rows: [
          row({ id: 'bier', name: 'Bier (Stella)', pct: 0.5, perUnit: 24, price: 16.45, basis: 'incl', source: cg }),
          row({ id: 'wijn', name: 'Wijn', pct: 0.1, perUnit: 5, price: 3.89, basis: 'incl', source: cg }),
          row({
            id: 'stelz',
            name: 'Stëlz peach',
            pct: 0.2,
            perUnit: 12,
            price: 19.17,
            basis: 'incl',
            source: { type: 'afspraak', note: 'Via de Fakbar' },
          }),
          row({ id: 'cava', name: 'Cava', pct: 0.2, perUnit: 10, price: 5.49, basis: 'incl', source: cg }),
          row({
            id: 'sap',
            name: 'Fruitsap',
            mixOf: 'cava',
            perUnit: 13,
            price: 1.23,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
        ],
      },
      {
        id: 'nonalc',
        name: 'Niet-alcohol',
        type: 'variable',
        distribute: true,
        share: 0.3,
        perPerson: 4,
        rows: [
          row({
            id: 'lim',
            name: 'Limonade orange',
            pct: 0.3,
            perUnit: 6,
            price: 0.89,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
          row({
            id: 'tea',
            name: 'Iced tea peach',
            pct: 0.3,
            perUnit: 6,
            price: 0.82,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
          row({
            id: 'cola',
            name: 'Cola regular',
            pct: 0.2,
            perUnit: 6,
            price: 0.57,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
          row({
            id: 'zero',
            name: 'Cola zero',
            pct: 0.2,
            perUnit: 6,
            price: 0.55,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
        ],
      },
      {
        id: 'eten',
        name: 'Eten',
        type: 'variable',
        distribute: false,
        rows: [
          row({
            id: 'oven',
            name: 'Ovenhapjes',
            perPerson: 2,
            perUnit: 40,
            price: 4.29,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
          row({
            id: 'chipz',
            name: 'Chips Zout',
            perPerson: 0.3,
            perUnit: 1,
            price: 0.65,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
          row({
            id: 'chipp',
            name: 'Chips Paprika',
            perPerson: 0.3,
            perUnit: 1,
            price: 0.62,
            basis: 'incl',
            productVat: 0.06,
            source: cg,
          }),
        ],
      },
    ],
  };
}

const lineOf = (content: BudgetContent, ctx: CalcContext, id: string) =>
  overviewOf(content, ctx).lines.find((l) => l.id === id)!.amount;

describe('Live Cantus (Activiteiten, BO 12)', () => {
  const ctx: CalcContext = { postKey: 'g:acti', settings: settings() };

  it('komt uit op hetzelfde totaal als het blad', () => {
    const content = liveCantus();
    const o = overviewOf(content, ctx);
    expect(toCents(lineOf(content, ctx, 'inkom'))).toBe(219446);
    expect(toCents(lineOf(content, ctx, 'zaal'))).toBe(78582);
    expect(toCents(lineOf(content, ctx, 'inkleding'))).toBe(19764);
    expect(toCents(lineOf(content, ctx, 'drank'))).toBe(237835);
    expect(toCents(o.total)).toBe(-116736);
    expect(toCents(o.diff!)).toBe(4765);
  });

  it('telt de doelgroepen zoals het blad (100 leden, 56 niet-leden, 4 ereleden)', () => {
    const content = liveCantus();
    const inkom = content.sections[0];
    if (inkom.type !== 'income') throw new Error();
    expect(inkom.rows.map((r) => incomeCount(content, r))).toEqual([100, 56, 5, 4, 0]);
  });

  it('rondt vaten naar boven af en past ze aan het aantal deelnemers aan', () => {
    const content = liveCantus();
    const { row, section } = findCostRow(content, 'bier')!;
    expect(unitsOf(content, section, row)).toBe(8);
    content.params.persons = 180;
    expect(unitsOf(content, section, row)).toBe(9);
  });

  it('aanvaardt 89,25 % omdat water de rest is, en weigert meer dan 100 %', () => {
    const content = liveCantus();
    const drank = content.sections[3] as CostSection;
    expect(distributionOf(drank)).toMatchObject({ ok: true });
    expect(distributionOf(drank).rest).toBeCloseTo(0.1075, 6);
    drank.rows[0].pct = 0.95;
    expect(distributionOf(drank).ok).toBe(false);
    expect(checksOf(content, ctx, true).some((c) => c.level === 'block' && c.sectionId === 'drank')).toBe(true);
  });

  it('vraagt een reden wanneer de huur afwijkt van de zaal', () => {
    const content = liveCantus();
    const huur = findCostRow(content, 'huur')!.row;
    expect(checksOf(content, ctx, true).find((c) => c.rowId === 'huur')?.level).toBe('review');
    huur.overrideReason = '';
    expect(checksOf(content, ctx, true).find((c) => c.rowId === 'huur')?.level).toBe('block');
  });

  it('neemt 1,95 voor sangria als de zaal geen sangriaprijs heeft', () => {
    const content = liveCantus();
    content.info.location = 'Zamo';
    const c: CalcContext = {
      postKey: 'g:acti',
      settings: settings({ locations: [{ ...WAAIBERG, name: 'Zamo', sangria: null }] }),
    };
    const { row } = findCostRow(content, 'sangria')!;
    expect(unitAmount(content, c, row).price).toBe(1.95);
  });
});

describe('IT Nieuw Materiaal (BO 12, tarief 10,5 %)', () => {
  const ctx: CalcContext = { postKey: 'g:it', settings: settings({ vatByPost: { 'g:it': 0.105 } }) };

  it('rekent een winkelprijs om zoals (119/1.21)*1.105 en een prijs excl. zoals 64.88*1.105', () => {
    const content = itNieuwMateriaal();
    expect(unitAmount(content, ctx, findCostRow(content, 'router')!.row).amount).toBeCloseTo(108.6735537, 6);
    expect(unitAmount(content, ctx, findCostRow(content, 'eth75')!.row).amount).toBeCloseTo(71.6924, 6);
  });

  it('telt Verzendkosten zoals ingetypt tot iemand incl. of excl. kiest, en meldt dat', () => {
    const content = itNieuwMateriaal();
    expect(toCents(overviewOf(content, ctx).total)).toBe(-23415);
    expect(checksOf(content, ctx, true).find((c) => c.rowId === 'verzend')?.level).toBe('block');
    findCostRow(content, 'verzend')!.row.basis = 'incl';
    expect(unitAmount(content, ctx, findCostRow(content, 'verzend')!.row).amount).toBeCloseTo((5.99 / 1.21) * 1.105, 6);
  });

  it('rekent Bedrijvenrelaties (0 %) zoals =1.85/1.06', () => {
    const content = itNieuwMateriaal();
    const r = findCostRow(content, 'router')!.row;
    r.price = 1.85;
    r.productVat = 0.06;
    const c: CalcContext = { postKey: 'g:br', settings: settings({ vatByPost: { 'g:br': 0 } }) };
    expect(unitAmount(content, c, r).amount).toBeCloseTo(1.85 / 1.06, 9);
  });

  it('vraagt een reden voor een ander tarief dan dat van de post', () => {
    const content = itNieuwMateriaal();
    content.vat = { rate: 0.21, reason: '' };
    expect(checksOf(content, ctx, true).find((c) => c.field === 'vat')?.level).toBe('block');
  });
});

describe('PeMe Silent-Disco (Onthaal, BO 12)', () => {
  const ctx: CalcContext = { postKey: 'g:onthaal', settings: settings() };

  it('komt uit op het blad, min de 0,10 van de serpentines', () => {
    const content = pemeSilentDisco();
    const o = overviewOf(content, ctx);
    expect(toCents(lineOf(content, ctx, 'alcohol') + lineOf(content, ctx, 'nonalc'))).toBe(27049);
    expect(toCents(lineOf(content, ctx, 'eten'))).toBe(5574);
    expect(toCents(lineOf(content, ctx, 'pd'))).toBe(6666);
    expect(toCents(lineOf(content, ctx, 'algemeen'))).toBe(47465);
    expect(toCents(o.income)).toBe(39070);
    expect(toCents(o.total)).toBe(-47684);
  });

  it('telt een mix één keer: 114 % over alles samen, maar elke verdeling 100 %', () => {
    const content = pemeSilentDisco();
    const alcohol = content.sections.find((s) => s.id === 'alcohol') as CostSection;
    expect(distributionOf(alcohol)).toMatchObject({ ok: true, sum: 1 });
    expect(checksOf(content, ctx, true).filter((c) => c.level === 'block')).toEqual([]);
  });
});

describe('sjablonen en schema', () => {
  it('geeft sjablonen die het schema aanvaardt', () => {
    for (const t of ['standaard', 'cantus'] as const) {
      expect(budgetContentSchema.safeParse(templateContent(t, true)).success).toBe(true);
    }
    expect(budgetContentSchema.safeParse(liveCantus()).success).toBe(true);
    expect(budgetContentSchema.safeParse(pemeSilentDisco()).success).toBe(true);
  });

  it('weigert een sectie met de naam uit het sjabloon', () => {
    const content = itNieuwMateriaal();
    content.sections[0].name = 'Naam kost';
    expect(
      checksOf(content, { postKey: 'g:it', settings: settings() }, true).some(
        (c) => c.level === 'block' && c.sectionId === 'materiaal'
      )
    ).toBe(true);
  });

  it('vraagt een bedrag uit de begroting', () => {
    const content = itNieuwMateriaal();
    content.begroting = null;
    expect(
      checksOf(content, { postKey: 'g:it', settings: settings() }, true).some(
        (c) => c.field === 'begroting' && c.level === 'block'
      )
    ).toBe(true);
  });
});

describe('Collect&Go: links en productpagina', () => {
  it('herkent een product achter #pdp_, een productpagina en ProductDisplay', () => {
    expect(
      parseCollectGoUrl('https://www.collectandgo.be/nl/zoek?searchTerm=ice+tea&filters=x#pdp_3074457345616732253')
    ).toEqual({ productId: '3074457345616732253' });
    expect(parseCollectGoUrl('https://www.collectandgo.be/colruyt/nl/assortiment/everyday-cola-regular-1-5l')).toEqual({
      path: '/nl/assortiment/everyday-cola-regular-1-5l',
    });
    expect(
      parseCollectGoUrl(
        'https://www.collectandgo.be/webapp/wcs/stores/servlet/ProductDisplay?productId=3074457345616677861&storeId=90004'
      )
    ).toEqual({ productId: '3074457345616677861' });
  });

  it('weigert een zoekpagina zonder product, een categorie met filters en een andere site', () => {
    expect(parseCollectGoUrl('https://www.collectandgo.be/nl/zoek?searchTerm=sangria')).toBeNull();
    expect(
      parseCollectGoUrl('https://www.collectandgo.be/nl/assortiment/limonade?rootCategoryId=72024&page=5')
    ).toBeNull();
    expect(parseCollectGoUrl('https://www.bol.com/be/nl/p/opblaasbare-radio/9200000074882535/')).toBeNull();
    expect(parseCollectGoUrl('geen link')).toBeNull();
  });

  it('leest naam en prijs uit de JSON-LD, ook met een regeleinde in de beschrijving', () => {
    const html = `<html><head><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "description": "*Bruisend
*Bevat cafeïne",
        "name": "EVERYDAY cola regular 1,5L &amp; meer",
        "offers": { "@type": "Offer", "availability": "https://schema.org/InStock", "price": "0.57", "priceCurrency": "EUR" },
        "sku": "3074457345616677861",
        "brand": { "@type": "Brand", "name": "EVERYDAY" }
      }
    </script></head><!-- BEGIN ProductDisplay.jsp --></html>`;
    expect(parseProductPage(html)).toEqual({
      name: 'EVERYDAY cola regular 1,5L & meer',
      price: 0.57,
      sku: '3074457345616677861',
      available: true,
    });
    expect(parseProductPage('<title>Pagina niet gevonden</title>')).toBeNull();
  });

  it('vergelijkt met de winkelprijs van de regel, ook als die excl. BTW staat', () => {
    const found = (price: number) => ({ status: 'found' as const, product: { name: 'Cola', price, available: true } });
    expect(
      checkFromLookup(row({ id: 'a', name: 'Cola', price: 0.57, basis: 'incl' }), found(0.57), '2026-11-08T22:00:00Z')
        .status
    ).toBe('ok');
    expect(
      checkFromLookup(
        row({ id: 'a', name: 'Cola', price: 0.57 / 1.06, basis: 'excl', productVat: 0.06 }),
        found(0.57),
        'x'
      ).status
    ).toBe('ok');
    expect(checkFromLookup(row({ id: 'a', name: 'Cola', price: 0.57, basis: 'incl' }), found(0.61), 'x')).toMatchObject(
      { status: 'changed', price: 0.61 }
    );
  });

  it('zet een gewijzigde prijs bij de controles, tot iemand ze overneemt', () => {
    const content = pemeSilentDisco();
    const wijn = findCostRow(content, 'wijn')!.row;
    wijn.source = {
      type: 'collectgo',
      url: 'https://www.collectandgo.be/nl/zoek?searchTerm=wijn#pdp_3074457345616000001',
    };
    wijn.lastCheck = { at: '2026-11-08T22:00:00Z', status: 'changed', price: 4.19, name: 'Wijn wit' };
    const ctx: CalcContext = { postKey: 'g:onthaal', settings: settings() };
    expect(checksOf(content, ctx, true).find((c) => c.rowId === 'wijn')?.text).toContain('4,19');
    acceptCheckedPrice(wijn);
    expect(wijn.price).toBe(4.19);
    expect(checksOf(content, ctx, true).some((c) => c.rowId === 'wijn')).toBe(false);
  });
});

describe('Download voor Drive', () => {
  it('geeft een blad dat de scan leest zoals elk budget', async () => {
    const content = liveCantus();
    const ctx: CalcContext = { postKey: 'g:acti', settings: settings() };
    const sheets = budgetSheet(content, ctx, {
      title: 'Live Cantus',
      postName: 'Activiteiten',
      year: '26-27',
      madeOn: '8 november 2026',
      nl: true,
    });
    const buffer = await writeXlsxFile(sheets).toBuffer();
    const figures = figuresFromSheet(readWorkbook(Buffer.from(buffer)).sheets[0]);
    expect(figures).not.toBeNull();
    expect(figures!.sheetPost).toBe('Activiteiten');
    expect(figures!.sheetTitle).toBe('Live Cantus');
    expect(figures!.budgetTotalCents).toBe(-116736);
    expect(figures!.budgetIncomeCents).toBe(219446);
    expect(figures!.allocationCents).toBe(-121500);
    expect(figures!.location).toBe('Waaiberg');
    expect(figures!.eventDate?.toISOString().slice(0, 10)).toBe('2026-11-16');
    expect(figures!.lines.map((l) => [l.label, l.side, l.budgetCents])).toEqual([
      ['Inkom', 'in', 219446],
      ['Zaal', 'out', 78582],
      ['Inkleding & varia', 'out', 19764],
      ['Drank', 'out', 237835],
    ]);
  });

  it('geeft een sectie die Inkomsten heet een andere naam in het overzicht', async () => {
    const content = itNieuwMateriaal();
    content.sections.unshift({
      id: 'in',
      name: 'Inkomsten',
      type: 'income',
      rows: [{ id: 'x', name: 'Sponsor', count: { type: 'manual', qty: 1 }, price: { type: 'manual', value: 50 } }],
    });
    const sheets = budgetSheet(
      content,
      { postKey: 'g:it', settings: settings() },
      { title: 'Nieuw Materiaal', postName: 'IT', year: '26-27', madeOn: '', nl: true }
    );
    const figures = figuresFromSheet(readWorkbook(Buffer.from(await writeXlsxFile(sheets).toBuffer())).sheets[0]);
    expect(figures!.budgetIncomeCents).toBe(5000);
    expect(figures!.lines[0]).toMatchObject({ label: 'Inkomsten (regels)', side: 'in', budgetCents: 5000 });
  });

  it('noemt het bestand zoals de scan een budget herkent', () => {
    expect(budgetFileName('26-27', 'Activiteiten', 'Live Cantus')).toBe('26-27_Budget_Activiteiten_Live Cantus.xlsx');
    expect(budgetFileName('26-27', 'Cultuur', 'Reis/Vluchten_v2')).toBe('26-27_Budget_Cultuur_Reis Vluchten v2.xlsx');
  });
});
