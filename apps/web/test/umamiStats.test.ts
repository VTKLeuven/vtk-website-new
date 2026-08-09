import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { magazineStats, periodStart, resetUmamiStatsCache } from '@/lib/umami-stats';

const now = new Date('2026-08-09T12:00:00.000Z');

beforeEach(() => {
  resetUmamiStatsCache();
  process.env.UMAMI_PUBLIC_URL = 'https://analytics.test';
  process.env.UMAMI_SHARE_ID = 'deel-id';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.UMAMI_PUBLIC_URL;
  delete process.env.UMAMI_SHARE_ID;
  resetUmamiStatsCache();
});

describe('de meetperiode', () => {
  it('rekent 30 dagen terug', () => {
    expect(periodStart('30d', now)).toEqual(new Date('2026-07-10T12:00:00.000Z'));
  });

  it('laat het werkingsjaar op 15 juli beginnen', () => {
    // Dezelfde grens als bij rollen en posten; anders telt een redactie haar
    // eigen jaargang niet zoals de kring die telt.
    expect(periodStart('jaar', now)).toEqual(new Date('2026-07-15T00:00:00.000Z'));
    // In juni hoort dat de 15de juli van het jaar ervoor te zijn.
    expect(periodStart('jaar', new Date('2026-06-01T12:00:00.000Z'))).toEqual(
      new Date('2025-07-15T00:00:00.000Z'),
    );
  });
});

/** Een fetch die per pad een antwoord teruggeeft. */
function stubFetch(responses: Record<string, unknown>, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const match = Object.keys(responses).find((key) => url.includes(key));
      if (!match) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: status === 200, status, json: async () => responses[match] };
    }),
  );
  return calls;
}

describe('de cijfers ophalen', () => {
  it('zegt dat er niets ingesteld is zonder share-id', async () => {
    delete process.env.UMAMI_SHARE_ID;
    const result = await magazineStats('30d', now);
    expect(result).toEqual({ ok: false, error: 'not_configured' });
  });

  it('wisselt het share-id om voor een token en telt per adres', async () => {
    const calls = stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      '/metrics': [
        { x: '/media/bakske/2025-2026-s2w6', y: 412 },
        { x: '/media/ir-reeel/2025-september', y: 88 },
      ],
      '/event-data/values': [{ value: 'bakske-2025-2026-s2w6', total: 17 }],
    });

    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.views['/media/bakske/2025-2026-s2w6']).toBe(412);
    expect(result.downloads['bakske-2025-2026-s2w6']).toBe(17);
    // Het website-id komt uit het share-antwoord, niet uit de omgeving.
    expect(calls.some((url) => url.includes('/api/websites/website-1/metrics'))).toBe(true);
  });

  it('valt terug op onbereikbaar wanneer het share-id niets oplevert', async () => {
    stubFetch({});
    expect(await magazineStats('30d', now)).toEqual({ ok: false, error: 'unreachable' });
  });

  it('toont weergaven ook wanneer de downloads niet lukken', async () => {
    // Best effort: liever de helft van de cijfers dan een lege pagina.
    stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      '/metrics': [{ x: '/media/bakske/2025-2026-s2w6', y: 5 }],
    });

    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.views['/media/bakske/2025-2026-s2w6']).toBe(5);
    expect(result.downloads).toEqual({});
  });

  it('negeert rijen met een onverwachte vorm in plaats van om te vallen', async () => {
    stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      '/metrics': [{ x: '/media/bakske/a', y: 3 }, { x: 12, y: 4 }, null, { x: '/b' }],
      '/event-data/values': { onverwacht: true },
    });

    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.views).toEqual({ '/media/bakske/a': 3 });
    expect(result.downloads).toEqual({});
  });

  it('haalt niet opnieuw op binnen dezelfde periode', async () => {
    const calls = stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      '/metrics': [{ x: '/media/bakske/a', y: 1 }],
      '/event-data/values': [],
    });

    await magazineStats('30d', now);
    const na = calls.length;
    await magazineStats('30d', now);
    expect(calls.length).toBe(na);
  });
});
