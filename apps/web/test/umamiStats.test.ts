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

  it('wisselt het share-id om voor een token en telt per nummer', async () => {
    const calls = stubFetch({
      // Zo antwoordt Umami 3.2 echt: `websiteId`, niet `id`.
      '/api/share/': {
        shareId: 'deel-id',
        websiteId: 'website-1',
        token: 'geheim',
        parameters: {},
      },
      'event=bakske-bekeken': [{ value: 'bakske-2025-2026-s2w6', total: 412 }],
      'event=irreel-bekeken': [{ value: 'ir-reeel-2025-september', total: 88 }],
      'event=bakske-download': [{ value: 'bakske-2025-2026-s2w6', total: 17 }],
      'event=aftermovie': [{ value: 'video-1', total: 5 }],
    });

    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.views).toEqual({
      'bakske-2025-2026-s2w6': 412,
      'ir-reeel-2025-september': 88,
    });
    expect(result.downloads).toEqual({ 'bakske-2025-2026-s2w6': 17 });
    expect(result.aftermovies).toEqual({ 'video-1': 5 });
    // Het website-id komt uit het share-antwoord, niet uit de omgeving.
    expect(calls.some((url) => url.includes('/api/websites/website-1/event-data/values'))).toBe(
      true,
    );
  });

  it('vraagt het event met `event=`, niet met `eventName=`', async () => {
    // Umami 3.x negeert `eventName` stil en geeft dan een lege lijst terug:
    // geen fout, enkel nul weergaven en nul downloads voor elk nummer.
    const calls = stubFetch({
      '/api/share/': { websiteId: 'website-1', token: 'geheim' },
      '/event-data/values': [],
    });
    await magazineStats('30d', now);
    const valueCalls = calls.filter((url) => url.includes('/event-data/values'));
    expect(valueCalls.length).toBeGreaterThan(0);
    for (const url of valueCalls) {
      expect(url).toMatch(/[?&]event=/);
      expect(url).not.toContain('eventName=');
    }
  });

  it('telt de paginaweergaven niet mee', async () => {
    // De lezer stuurt een paginaweergave én een event; het nieuws enkel het
    // event. Beide tellen zou de lezer dubbel rekenen.
    const calls = stubFetch({
      '/api/share/': { websiteId: 'website-1', token: 'geheim' },
      '/event-data/values': [],
    });
    await magazineStats('30d', now);
    expect(calls.some((url) => url.includes('/metrics'))).toBe(false);
  });

  it('blijft werken met het oudere `id`-veld in het share-antwoord', async () => {
    const calls = stubFetch({
      '/api/share/': { id: 'oud-1', token: 'geheim' },
      '/event-data/values': [],
    });
    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    expect(calls.some((url) => url.includes('/api/websites/oud-1/event-data/values'))).toBe(true);
  });

  it('stuurt naast het token ook de share-context mee', async () => {
    // Zonder die tweede header weigert Umami met "Share token used outside
    // share context", en dat kwam als 401 terug.
    const headers: Array<Record<string, string>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        headers.push(init?.headers ?? {});
        return {
          ok: true,
          status: 200,
          json: async () => (url.includes('/api/share/') ? { websiteId: 'w', token: 't' } : []),
        };
      }),
    );

    await magazineStats('30d', now);
    const metricsCall = headers[1];
    expect(metricsCall['x-umami-share-token']).toBe('t');
    expect(metricsCall['x-umami-share-context']).toBe('1');
  });

  it('valt terug op onbereikbaar wanneer het share-id niets oplevert', async () => {
    stubFetch({});
    expect(await magazineStats('30d', now)).toEqual({ ok: false, error: 'unreachable' });
  });

  it('toont weergaven ook wanneer de downloads niet lukken', async () => {
    // Best effort: liever de helft van de cijfers dan een lege pagina.
    stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      'event=bakske-bekeken': [{ value: 'bakske-2025-2026-s2w6', total: 5 }],
    });

    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.views['bakske-2025-2026-s2w6']).toBe(5);
    expect(result.downloads).toEqual({});
  });

  it('meldt een fout wanneer geen enkele weergave terugkomt', async () => {
    stubFetch({ '/api/share/': { id: 'website-1', token: 'geheim' } });
    expect(await magazineStats('30d', now)).toEqual({ ok: false, error: 'umami_error' });
  });

  it('negeert rijen met een onverwachte vorm in plaats van om te vallen', async () => {
    stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      'event=bakske-bekeken': [
        { value: 'bakske-a', total: 3 },
        { value: 12, total: 4 },
        null,
        { value: 'bakske-b' },
      ],
      '/event-data/values': { onverwacht: true },
    });

    const result = await magazineStats('30d', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.views).toEqual({ 'bakske-a': 3 });
    expect(result.downloads).toEqual({});
  });

  it('haalt niet opnieuw op binnen dezelfde periode', async () => {
    const calls = stubFetch({
      '/api/share/': { id: 'website-1', token: 'geheim' },
      '/event-data/values': [{ value: 'bakske-a', total: 1 }],
    });

    await magazineStats('30d', now);
    const na = calls.length;
    await magazineStats('30d', now);
    expect(calls.length).toBe(na);
  });

  it('geeft een andere periode nooit de cijfers van de vorige', async () => {
    // Twee aanvragen tegelijk, voor twee periodes: de tweede wachtte vroeger op
    // de eerste en kreeg haar antwoord, ook na de cache.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/share/')) {
          return { ok: true, status: 200, json: async () => ({ websiteId: 'w', token: 't' }) };
        }
        const start = Number(new URL(url).searchParams.get('startAt'));
        const total = start === periodStart('alles', now).getTime() ? 50 : 5;
        return { ok: true, status: 200, json: async () => [{ value: 'bakske-a', total }] };
      }),
    );

    const [kort, alles] = await Promise.all([
      magazineStats('30d', now),
      magazineStats('alles', now),
    ]);
    expect(kort.ok && kort.views['bakske-a']).toBe(10);
    expect(alles.ok && alles.views['bakske-a']).toBe(100);
    const opnieuw = await magazineStats('30d', now);
    expect(opnieuw.ok && opnieuw.views['bakske-a']).toBe(10);
  });
});
