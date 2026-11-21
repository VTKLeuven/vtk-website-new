import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme-shared';

describe('THEME_SCRIPT', () => {
  it('leest dezelfde sleutel als de knop schrijft', () => {
    expect(THEME_SCRIPT).toContain(`var k='${THEME_STORAGE_KEY}',`);
  });
});
