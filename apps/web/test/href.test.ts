import { describe, expect, it } from 'vitest';
import { isExternalUrl, withLocaleBase } from '@/lib/href';

describe('isExternalUrl', () => {
  it('herkent een pad op deze site', () => {
    expect(isExternalUrl('/shift')).toBe(false);
    expect(isExternalUrl('/info/uitleendienst')).toBe(false);
  });

  it('herkent een adres buiten deze site', () => {
    expect(isExternalUrl('https://logistiek.dev.vtk.be')).toBe(true);
    expect(isExternalUrl('mailto:logistiek@vtk.be')).toBe(true);
    // Protocol-relatief: erft het schema van de pagina, maar wijst wel weg.
    expect(isExternalUrl('//cudi.vtk.be')).toBe(true);
  });
});

describe('withLocaleBase', () => {
  it('houdt een interne knop in dezelfde taal', () => {
    // De knop op /en/info/shiften moet naar /en/shift, niet naar /shift. Dat
    // laatste bestaat namelijk ook en werkt, maar zet de bezoeker terug in het
    // Nederlands zonder dat iets misgaat waar je het aan ziet.
    expect(withLocaleBase('/shift', '/en')).toBe('/en/shift');
    expect(withLocaleBase('/shift', '')).toBe('/shift');
  });

  it('laat een extern adres met rust', () => {
    expect(withLocaleBase('https://logistiek.dev.vtk.be', '/en')).toBe(
      'https://logistiek.dev.vtk.be'
    );
  });
});
