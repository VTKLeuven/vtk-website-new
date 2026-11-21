import { describe, expect, it } from 'vitest';
import { INPUT_LIMITS, inputProblem, isQuantityLine, list, str } from '@/lib/action-input';

/**
 * De eerste toets op wat een ledenactie binnenkrijgt (S6 uit de audit van
 * november 2026): wie een action rechtstreeks aanroept, stuurt wat hij wil, en
 * dat mag een melding geven maar geen foutpagina.
 */
describe('inputProblem', () => {
  it('laat gewone formulierdata door', () => {
    expect(
      inputProblem([
        {
          eventName: 'Galabal',
          pickupDate: '2030-01-10',
          lines: [{ itemId: 'abc', quantity: 4 }],
          helpers: [{ name: 'Jonas', phone: null }],
          delivery: false,
          note: undefined,
        },
      ])
    ).toBeNull();
  });

  it('weigert een reuzentekst', () => {
    expect(inputProblem([{ note: 'x'.repeat(INPUT_LIMITS.maxString + 1) }])).toBe('too_long');
    expect(inputProblem([{ note: 'x'.repeat(INPUT_LIMITS.maxString) }])).toBeNull();
  });

  it('weigert een lijst van duizenden lijnen', () => {
    const lines = Array.from({ length: INPUT_LIMITS.maxArray + 1 }, () => ({ itemId: 'a', quantity: 1 }));
    expect(inputProblem([{ lines }])).toBe('too_many');
  });

  it('weigert een object met duizenden sleutels', () => {
    const wide = Object.fromEntries(Array.from({ length: INPUT_LIMITS.maxArray + 1 }, (_, i) => [`k${i}`, 1]));
    expect(inputProblem([wide])).toBe('too_many');
  });

  it('weigert te diep geneste invoer', () => {
    let deep: unknown = 'bodem';
    for (let i = 0; i < INPUT_LIMITS.maxDepth + 2; i++) deep = { deeper: deep };
    expect(inputProblem([deep])).toBe('too_deep');
  });

  it('weigert wat geen gewone JSON is', () => {
    expect(inputProblem([{ at: new Date() }])).toBe('invalid');
    expect(inputProblem([{ quantity: Number.NaN }])).toBe('invalid');
    expect(inputProblem([{ quantity: Number.POSITIVE_INFINITY }])).toBe('invalid');
    expect(inputProblem([new Map()])).toBe('invalid');
    expect(inputProblem([() => 1])).toBe('invalid');
    expect(inputProblem([BigInt(1)])).toBe('invalid');
  });

  it('aanvaardt een object zonder prototype', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.name = 'sjabloon';
    expect(inputProblem([bare])).toBeNull();
  });
});

describe('str, list en isQuantityLine', () => {
  it('maakt van alles wat geen tekst is een lege tekst', () => {
    expect(str('  Galabal ')).toBe('  Galabal ');
    expect(str(42)).toBe('');
    expect(str(null)).toBe('');
    expect(str(undefined)).toBe('');
    expect(str({ trim: () => 'x' })).toBe('');
  });

  it('maakt van alles wat geen lijst is een lege lijst', () => {
    expect(list([1, 2])).toEqual([1, 2]);
    expect(list(null)).toEqual([]);
    expect(list(undefined)).toEqual([]);
    // Wat de types niet toelaten, kan een rechtstreekse aanroep wel sturen.
    expect(list('abc' as unknown as string[])).toEqual([]);
    expect(list({ length: 2 } as unknown as number[])).toEqual([]);
  });

  it('houdt enkel lijnen met een item en een positief geheel aantal', () => {
    const lines = [
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 0 },
      { itemId: 'c', quantity: 1.5 },
      { itemId: 7, quantity: 1 },
      { itemId: 'd', quantity: '3' },
      null,
    ] as unknown as Array<{ itemId: string; quantity: number }>;
    expect(lines.filter(isQuantityLine)).toEqual([{ itemId: 'a', quantity: 2 }]);
  });
});
