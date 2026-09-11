import { describe, expect, it } from 'vitest';
import { compareText, nextSortDir } from '@/app/beheer/sort';

describe('compareText', () => {
  it('orders ascending', () => {
    expect(compareText('appel', 'banaan', 'asc')).toBeLessThan(0);
    expect(compareText('banaan', 'appel', 'asc')).toBeGreaterThan(0);
  });

  it('flips the sign when descending', () => {
    expect(compareText('appel', 'banaan', 'desc')).toBeGreaterThan(0);
    expect(compareText('banaan', 'appel', 'desc')).toBeLessThan(0);
  });

  it('is case-insensitive (base sensitivity)', () => {
    // Equal strings compare as zero; `desc` yields -0, which sorts like 0.
    expect(compareText('Appel', 'appel', 'asc')).toBe(0);
    expect(compareText('KABEL', 'kabel', 'desc') === 0).toBe(true);
  });

  it('returns 0 for identical strings', () => {
    expect(compareText('gitaar', 'gitaar', 'asc')).toBe(0);
  });

  it('sorts a list deterministically', () => {
    const items = ['Gitaar', 'appel', 'Banaan', 'cola'];
    expect([...items].sort((a, b) => compareText(a, b, 'asc'))).toEqual([
      'appel',
      'Banaan',
      'cola',
      'Gitaar',
    ]);
  });
});

describe('nextSortDir', () => {
  it('draait om bij een tweede klik op dezelfde sleutel', () => {
    expect(nextSortDir('naam', 'naam', 'asc')).toBe('desc');
    expect(nextSortDir('naam', 'naam', 'desc')).toBe('asc');
  });

  it('begint bij de standaard van een andere sleutel', () => {
    // Een datumkolom leest van nieuw naar oud; zonder deze regel begin je op de
    // oudste rij van 2019 zodra je erop klikt.
    expect(nextSortDir('datum', 'naam', 'desc', 'desc')).toBe('desc');
    expect(nextSortDir('naam', 'datum', 'desc')).toBe('asc');
  });

  it('behandelt "nog niets gekozen" als een andere sleutel', () => {
    expect(nextSortDir('naam', null, 'asc')).toBe('asc');
    expect(nextSortDir('datum', null, 'asc', 'desc')).toBe('desc');
  });
});
