import { describe, expect, it } from 'vitest';
import {
  canChangeTypeWithAnswers,
  fieldCodeFrom,
  parseFieldConfig,
  storageKindFor,
  validateFieldConfig,
} from '@/lib/forms/schema';

describe('veldcodes', () => {
  it('maakt een leesbare, stabiele sleutel van een label', () => {
    expect(fieldCodeFrom('Wat is je naam?')).toBe('wat_is_je_naam');
    expect(fieldCodeFrom('  Één café-bezoek  ')).toBe('een_cafe_bezoek');
  });

  it('valt terug op een naam wanneer er geen bruikbare tekens zijn', () => {
    expect(fieldCodeFrom('???')).toBe('veld');
  });

  it('ontwijkt codes die al bezet zijn', () => {
    expect(fieldCodeFrom('Naam', ['naam'])).toBe('naam_2');
    expect(fieldCodeFrom('Naam', ['naam', 'naam_2'])).toBe('naam_3');
  });
});

describe('typewissel met bestaande antwoorden', () => {
  it('laat een wissel binnen dezelfde opslagvorm toe', () => {
    expect(canChangeTypeWithAnswers('SHORT_TEXT', 'LONG_TEXT')).toBe(true);
    expect(canChangeTypeWithAnswers('SHORT_TEXT', 'EMAIL')).toBe(true);
    expect(canChangeTypeWithAnswers('SINGLE_CHOICE', 'DROPDOWN')).toBe(true);
  });

  it('weigert een wissel die het antwoord in de verkeerde kolom zou zetten', () => {
    expect(canChangeTypeWithAnswers('SINGLE_CHOICE', 'NUMBER')).toBe(false);
    expect(canChangeTypeWithAnswers('SHORT_TEXT', 'DATE')).toBe(false);
    expect(canChangeTypeWithAnswers('FILE', 'SHORT_TEXT')).toBe(false);
  });

  it('bewaart een schaal als getal en een toestemming als ja/nee', () => {
    expect(storageKindFor('SCALE')).toBe('NUMBER');
    expect(storageKindFor('CONSENT')).toBe('BOOLEAN');
  });
});

describe('config lezen', () => {
  it('negeert onbruikbare opgeslagen waarden in plaats van te crashen', () => {
    expect(parseFieldConfig('NUMBER', { min: 'veel' })).toEqual({});
    expect(parseFieldConfig('SHORT_TEXT', null)).toEqual({});
  });

  it('geeft een schaal altijd een bruikbaar bereik', () => {
    expect(parseFieldConfig('SCALE', {})).toMatchObject({ min: 1, max: 5 });
    expect(parseFieldConfig('SCALE', { min: 5, max: 2 })).toMatchObject({ min: 1, max: 5 });
    expect(parseFieldConfig('SCALE', { min: 0, max: 10 })).toMatchObject({ min: 0, max: 10 });
  });

  it('geeft een profielveld altijd een bron', () => {
    expect(parseFieldConfig('PROFILE', {}).profileField).toBe('RNUMBER');
    expect(parseFieldConfig('PROFILE', { profileField: 'STUDY_YEAR' }).profileField).toBe(
      'STUDY_YEAR'
    );
  });
});

describe('config valideren', () => {
  it('weigert een omgekeerd bereik', () => {
    expect(() => validateFieldConfig('NUMBER', { min: 10, max: 2 })).toThrow(
      'INVALID_FIELD_RANGE'
    );
    expect(() =>
      validateFieldConfig('MULTIPLE_CHOICE', { minChecked: 3, maxChecked: 1 })
    ).toThrow('INVALID_FIELD_RANGE');
    expect(() =>
      validateFieldConfig('DATE', { minDate: '2027-05-01', maxDate: '2027-04-01' })
    ).toThrow('INVALID_FIELD_RANGE');
  });

  it('weigert een patroon dat geen geldige regex is', () => {
    expect(() => validateFieldConfig('SHORT_TEXT', { pattern: '[' })).toThrow(
      'INVALID_FIELD_PATTERN'
    );
    expect(validateFieldConfig('SHORT_TEXT', { pattern: '^r[0-9]{7}$' }).pattern).toBe(
      '^r[0-9]{7}$'
    );
  });

  it('weigert een onmogelijke instelling in plaats van ze te negeren', () => {
    expect(() => validateFieldConfig('FILE', { maxSizeMb: 500 })).toThrow('INVALID_FIELD_CONFIG');
    expect(() => validateFieldConfig('FILE', { allowedExtensions: ['.pdf'] })).toThrow(
      'INVALID_FIELD_CONFIG'
    );
  });

  it('aanvaardt een bruikbare bestandsconfig', () => {
    expect(
      validateFieldConfig('FILE', { maxFiles: 3, maxSizeMb: 10, allowedExtensions: ['pdf', 'png'] })
    ).toMatchObject({ maxFiles: 3, maxSizeMb: 10, allowedExtensions: ['pdf', 'png'] });
  });
});
