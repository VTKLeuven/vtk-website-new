import { describe, expect, it } from 'vitest';
import { rateLimitKey, withinRateLimit } from '@/lib/forms/antiSpam';

describe('limiet op inzendingen', () => {
  it('telt een ingelogd lid per persoon, ook achter hetzelfde IP', () => {
    // Een praesidium op hetzelfde wifi: elf aanvragen van elf mensen mogen allemaal.
    const now = Date.now();
    for (let person = 0; person < 11; person += 1) {
      expect(withinRateLimit(rateLimitKey('vergadering', '10.0.0.1', `lid-${person}`), now)).toBe(true);
    }
  });

  it('telt een anonieme bezoeker per IP', () => {
    const now = Date.now();
    const key = rateLimitKey('publiek', '10.0.0.2');
    for (let i = 0; i < 10; i += 1) expect(withinRateLimit(key, now)).toBe(true);
    expect(withinRateLimit(key, now)).toBe(false);
  });
});
