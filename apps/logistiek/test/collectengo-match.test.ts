import { describe, expect, it } from 'vitest';
import {
  normalizeProductKey,
  splitProductName,
  suggestFlesserkeItem,
  type MatchCandidate,
} from '@/lib/collectengo/match';

const items: MatchCandidate[] = [
  { id: 'cola', name: 'cola regular', brand: 'EVERYDAY', contentAmount: '1,5', contentUnit: 'L' },
  { id: 'bubbles', name: 'Choco Bubbles', brand: 'BONI', contentAmount: '750', contentUnit: 'g' },
  { id: 'stella', name: 'pils 5,2% bak 24x25cl', brand: 'STELLA ARTOIS', contentAmount: null, contentUnit: null },
  { id: 'dweil', name: 'dweil 60x70cm', brand: 'EVERYDAY', contentAmount: '5', contentUnit: 'stuks' },
];

describe('splitProductName', () => {
  it('haalt merk en inhoud uit een Colruyt-productnaam', () => {
    expect(splitProductName('BONI Choco Bubbles 750g')).toEqual({
      brand: 'BONI',
      name: 'Choco Bubbles',
      contentAmount: '750',
      contentUnit: 'g',
    });
  });

  it('houdt een multiplier bij de inhoud', () => {
    expect(splitProductName('BONI Ijs Almond sticks 6x100ml')).toMatchObject({
      brand: 'BONI',
      name: 'Ijs Almond sticks',
      contentAmount: '6x100',
      contentUnit: 'ml',
    });
  });

  it('herkent een merk van twee woorden', () => {
    expect(splitProductName('STELLA ARTOIS pils 5,2% bak 24x25cl')).toMatchObject({
      brand: 'STELLA ARTOIS',
      name: 'pils 5,2% bak',
      contentAmount: '24x25',
      contentUnit: 'cl',
    });
  });

  it('laat een product zonder merk met rust', () => {
    expect(splitProductName('komkommer')).toEqual({
      brand: null,
      name: 'komkommer',
      contentAmount: null,
      contentUnit: null,
    });
  });

  it('verwart een maat niet met een woord', () => {
    expect(splitProductName('EVERYDAY olijfolie bakken & braden 1L')).toMatchObject({
      name: 'olijfolie bakken & braden',
      contentAmount: '1',
      contentUnit: 'L',
    });
  });
});

describe('suggestFlesserkeItem', () => {
  it('vindt een item terug ondanks merk en inhoud in de naam', () => {
    expect(suggestFlesserkeItem('BONI Choco Bubbles 750g', items)).toMatchObject({
      itemId: 'bubbles',
      confidence: 'EXACT',
    });
  });

  it('laat de onthouden keuze van vorige keer voorgaan', () => {
    const remembered = new Map([[normalizeProductKey('BONI Choco Bubbles 750g'), 'cola']]);
    expect(suggestFlesserkeItem('BONI Choco Bubbles 750g', items, remembered)).toMatchObject({
      itemId: 'cola',
      confidence: 'REMEMBERED',
    });
  });

  it('negeert een onthouden keuze naar een item dat niet meer bestaat', () => {
    const remembered = new Map([[normalizeProductKey('komkommer'), 'weg']]);
    expect(suggestFlesserkeItem('komkommer', items, remembered)).toBeNull();
  });

  it('stelt niets voor wanneer niets genoeg lijkt', () => {
    expect(suggestFlesserkeItem('BONI kebab voorgebakken 1kg', items)).toBeNull();
  });

  it('stelt een gelijkaardige naam voor zonder ze exact te noemen', () => {
    const suggestion = suggestFlesserkeItem('EVERYDAY cola regular 2L', items);
    expect(suggestion).toMatchObject({ itemId: 'cola' });
    expect(suggestion!.score).toBeLessThan(1);
  });
});
