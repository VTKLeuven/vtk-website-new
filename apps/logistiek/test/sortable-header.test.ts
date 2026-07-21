import { describe, expect, it } from 'vitest';
import { compareText } from '@/app/beheer/sortable-header';

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
