import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToText, parseCollectEnGoMail, parseEuroCents } from '@/lib/collectengo/parse';

const mail = readFileSync(path.join(__dirname, 'fixtures/collectengo-mail.txt'), 'utf8');

function parsed() {
  const result = parseCollectEnGoMail({ text: mail });
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

describe('parseEuroCents', () => {
  it('leest de vormen die in de mail voorkomen', () => {
    expect(parseEuroCents('€ 2,78')).toBe(278);
    expect(parseEuroCents('€762,89')).toBe(76289);
    expect(parseEuroCents('€ -16,29')).toBe(-1629);
    expect(parseEuroCents('€ 1.234,56')).toBe(123456);
    expect(parseEuroCents('geen bedrag')).toBeNull();
  });
});

describe('parseCollectEnGoMail', () => {
  it('leest de kop van de bestelling', () => {
    const order = parsed();
    expect(order.reservationNumber).toBe('40288042');
    expect(order.customerName).toBe('Sam Voorbeeld');
    expect(order.pickupPoint).toBe('HERENTALS (COLRUYT), BELGIELAAN 42, 2200 HERENTALS');
    // Zomertijd: 16:00 in Brussel is 14:00 UTC.
    expect(order.pickupFrom?.toISOString()).toBe('2026-07-10T14:00:00.000Z');
    expect(order.pickupUntil?.toISOString()).toBe('2026-07-10T15:00:00.000Z');
    expect(order.orderedAt?.toISOString()).toBe('2026-07-09T10:55:00.000Z');
  });

  it('leest de totalen onderaan', () => {
    const order = parsed();
    expect(order.subtotalCents).toBe(77223);
    expect(order.discountCents).toBe(-1629);
    expect(order.serviceCostCents).toBe(695);
    expect(order.totalCents).toBe(76289);
    // Subtotaal + kortingen + servicekost = totaal; kortingen zijn negatief.
    expect(order.subtotalCents! + order.discountCents! + order.serviceCostCents!).toBe(order.totalCents);
    expect(order.warnings).toEqual([]);
  });

  it('leest alle productlijnen met hun categorie', () => {
    const order = parsed();
    expect(order.lines).toHaveLength(67);
    expect(new Set(order.lines.map((line) => line.category)).size).toBe(15);
    expect(order.lines[0]).toMatchObject({
      category: 'Brood, ontbijtgranen, bloem en patisserie',
      productName: 'BONI Choco Bubbles 750g',
      quantity: 1,
      unit: 'PIECE',
      unitPriceCents: 278,
      unitPriceBasis: 'st',
      totalPriceCents: 278,
      note: null,
    });
  });

  it('houdt de notitie van de besteller bij, want die benoemt de acti', () => {
    const order = parsed();
    const stokbrood = order.lines.find((line) => line.productName.includes('stokbrood'));
    expect(stokbrood).toMatchObject({ note: 'Acti - livecantus', quantity: 8, totalPriceCents: 880 });
    const sap = order.lines.find((line) => line.productName.includes('Sinaasappelsap'));
    expect(sap?.note).toBe('Ploeg - Cocktailworkshop - Theokot');
  });

  it('herkent een prijs per kilo bij een stuksaantal', () => {
    const paprika = parsed().lines.find((line) => line.productName === 'rode paprika');
    expect(paprika).toMatchObject({
      unit: 'PIECE',
      quantity: 12,
      unitPriceCents: 269,
      unitPriceBasis: 'Kg',
      totalPriceCents: 807,
    });
  });

  it('herkent een lijn die per gewicht verkocht is', () => {
    const tomaten = parsed().lines.find((line) => line.productName === 'tomaten extra');
    expect(tomaten).toMatchObject({
      unit: 'WEIGHT',
      quantityText: '1,0 Kg',
      quantity: 1,
      unitPriceCents: 149,
      unitPriceBasis: 'Kg',
    });
  });

  it('hangt de leeggoedregel aan het product erboven, niet aan het volgende', () => {
    const order = parsed();
    const stella = order.lines.find((line) => line.productName.startsWith('STELLA'));
    expect(stella).toMatchObject({ depositCents: 2250, lineDiscountCents: -1629, quantity: 5 });
    const cara = order.lines.find((line) => line.productName.startsWith('CARA'));
    expect(cara).toMatchObject({ depositCents: 2250, lineDiscountCents: null });
    // De leeggoedregel mag geen notitie van het volgende product worden.
    const strongbow = order.lines.find((line) => line.productName.includes('Gold Apple'));
    expect(strongbow?.note).toBeNull();
  });

  it('laat de categorienaam niet in een productnaam belanden', () => {
    const order = parsed();
    expect(order.lines.some((line) => /^\d+ producten?$/.test(line.productName))).toBe(false);
    expect(order.lines.some((line) => line.productName.startsWith('Subtotaal'))).toBe(false);
  });

  it('leest dezelfde bestelling uit de HTML-variant van de mail', () => {
    // Zoals de mail eruitziet na het strippen van tags: elke cel op een eigen regel.
    const html = mail
      .split('\n')
      .map((line) => `<tr><td>${line.replace(/&/g, '&amp;').replace(/€/g, '&euro;')}</td></tr>`)
      .join('');
    const result = parseCollectEnGoMail({ html: `<table>${html}</table>` });
    if (!result.ok) throw new Error(result.error);
    expect(result.order.reservationNumber).toBe('40288042');
    expect(result.order.lines).toHaveLength(67);
    expect(result.order.totalCents).toBe(76289);
  });

  it('splitst een hoeveelheid en een eenheidsprijs die op twee regels staan', () => {
    const result = parseCollectEnGoMail({
      text: [
        'reservatienummer 12345678',
        'Dit zetten we voor je klaar:',
        'Diepvries',
        '1 product',
        'BONI kebab voorgebakken 1kg',
        '€ 41,84',
        '4 stuk(s)',
        '€ 10,46/st',
      ].join('\n'),
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.order.lines).toEqual([
      expect.objectContaining({
        productName: 'BONI kebab voorgebakken 1kg',
        category: 'Diepvries',
        quantity: 4,
        unitPriceCents: 1046,
        totalPriceCents: 4184,
      }),
    ]);
  });

  it('weigert een mail die geen Collect&Go-bevestiging is', () => {
    expect(parseCollectEnGoMail({ text: 'Dag Sam, je pakje is onderweg.' })).toEqual({
      ok: false,
      error: expect.stringContaining('reservatienummer'),
    });
  });
});

describe('htmlToText', () => {
  it('gooit opmaak weg en houdt de regels', () => {
    const text = htmlToText('<style>p{color:red}</style><p>BONI cola 1,5L</p><p>&euro;&nbsp;1,71</p>');
    expect(text).toBe('BONI cola 1,5L\n\n€ 1,71');
  });
});
