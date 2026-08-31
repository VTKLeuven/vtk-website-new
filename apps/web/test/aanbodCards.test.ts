import { describe, expect, it } from 'vitest';
import {
  AANBOD_DEFAULT_BODY_EN,
  AANBOD_DEFAULT_BODY_NL,
  aanbodCardBody,
} from '@/lib/aanbodCards';

describe('tekstje op een aanbod-kaart', () => {
  it('valt zonder eigen tekst terug op de standaardzin per taal', () => {
    expect(aanbodCardBody(null, null)).toEqual({
      bodyNl: AANBOD_DEFAULT_BODY_NL,
      bodyEn: AANBOD_DEFAULT_BODY_EN,
    });
  });

  it('behandelt spaties als leeg', () => {
    expect(aanbodCardBody('   ', '')).toEqual({
      bodyNl: AANBOD_DEFAULT_BODY_NL,
      bodyEn: AANBOD_DEFAULT_BODY_EN,
    });
  });

  it('neemt de eigen tekst per taal over', () => {
    expect(aanbodCardBody('Broodjes en koffie.', 'Sandwiches and coffee.')).toEqual({
      bodyNl: 'Broodjes en koffie.',
      bodyEn: 'Sandwiches and coffee.',
    });
  });

  it('laat de Engelse kaart op de Nederlandse tekst terugvallen, niet op de standaardzin', () => {
    const { bodyNl, bodyEn } = aanbodCardBody('Broodjes en koffie.', null);
    expect(bodyNl).toBe('Broodjes en koffie.');
    // Leeg, zodat `pick` in de Engelse locale bodyNl toont.
    expect(bodyEn).toBe('');
  });

  it('gebruikt de Engelse tekst ook op de Nederlandse kaart wanneer enkel die ingevuld is', () => {
    expect(aanbodCardBody('', 'Sandwiches and coffee.')).toEqual({
      bodyNl: 'Sandwiches and coffee.',
      bodyEn: 'Sandwiches and coffee.',
    });
  });
});
