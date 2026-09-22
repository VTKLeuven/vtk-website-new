import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '@/app/[locale]/admin/admin-table';

describe('normalizeSearchText', () => {
  it('verwijdert trema\'s en accenten voor vergelijkingen', () => {
    expect(normalizeSearchText('Zoë Sabbe')).toBe('zoe sabbe');
    expect(normalizeSearchText('Théo Dupont')).toBe('theo dupont');
    expect(normalizeSearchText('Hélène')).toBe('helene');
    expect(normalizeSearchText('Carl Söderberg')).toBe('carl soderberg');
    expect(normalizeSearchText('François')).toBe('francois');
  });

  it('geeft een identieke vorm voor geaccentueerde en niet-geaccentueerde zoektermen', () => {
    expect(normalizeSearchText('zoë')).toBe(normalizeSearchText('zoe'));
    expect(normalizeSearchText('théo')).toBe(normalizeSearchText('theo'));
    expect(normalizeSearchText('chloë')).toBe(normalizeSearchText('chloe'));
  });
});
