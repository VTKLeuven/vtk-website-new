import { describe, expect, it } from 'vitest';

import { shiftTierFor, shiftTierRange } from '@/lib/shift/tiers';

/**
 * De titels in de shiftranglijst: de drempels zijn een kringkeuze (zie "Titels
 * voor shiften" in docs/design-decisions.md), en de scheiding valt precies op
 * de drempel.
 */
describe('shiftTierFor', () => {
  it.each([
    [0, null],
    [2, null],
    [3, 'Medewerker'],
    [9, 'Medewerker'],
    [10, 'Bronze'],
    [14, 'Bronze'],
    [15, 'Vaste medewerker'],
    [19, 'Vaste medewerker'],
    [20, 'Silver'],
    [29, 'Silver'],
    [30, 'Gold'],
    [49, 'Gold'],
    [50, 'Platinum'],
    [120, 'Platinum'],
  ])('%i shiften geeft %s', (count, name) => {
    expect(shiftTierFor(count)?.nl ?? null).toBe(name);
  });
});

describe('shiftTierRange', () => {
  it('noemt het bereik tot de volgende drempel', () => {
    expect(shiftTierRange(shiftTierFor(20))).toBe('20 tot 29 shiften');
    expect(shiftTierRange(shiftTierFor(3), 'en')).toBe('3 to 9 shifts');
  });

  it('laat de hoogste titel open en noemt de groep zonder titel', () => {
    expect(shiftTierRange(shiftTierFor(50))).toBe('50 of meer shiften');
    expect(shiftTierRange(null)).toBe('minder dan 3 shiften');
    expect(shiftTierRange(null, 'en')).toBe('fewer than 3 shifts');
  });
});
