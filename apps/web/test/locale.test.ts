import { describe, expect, it } from 'vitest';
import { HTML_LANG, localeFromPath } from '@/lib/locale';

describe('taal uit het pad', () => {
  it('leest de taal uit het voorvoegsel dat proxy.ts in x-pathname zet', () => {
    expect(localeFromPath('/en/kalender')).toBe('en');
    expect(localeFromPath('/nl/kalender')).toBe('nl');
    expect(localeFromPath('/en')).toBe('en');
  });

  it('valt terug op Nederlands zonder of met een onbekend voorvoegsel', () => {
    expect(localeFromPath('/kalender')).toBe('nl');
    expect(localeFromPath('/fr/kalender')).toBe('nl');
    expect(localeFromPath('/')).toBe('nl');
    expect(localeFromPath('')).toBe('nl');
    expect(localeFromPath(null)).toBe('nl');
  });
});

describe('taalcode op het html-element', () => {
  it('gebruikt de Belgische variant voor het Nederlands, niet kaal nl', () => {
    expect(HTML_LANG.nl).toBe('nl-BE');
    expect(HTML_LANG.en).toBe('en');
  });
});
