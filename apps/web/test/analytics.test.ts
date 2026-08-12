import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_BEFORE_SEND_FUNCTION,
  analyticsConfigFromEnv,
  analyticsFilterSource,
  analyticsScript,
  excludedAnalyticsPaths,
  isExcludedFromAnalytics,
  magazineViewTitle,
  outboundHost,
  umamiEvent,
  magazineViewUrl,
} from '@/lib/analytics';

const config = { url: 'https://stats.vtk.be', websiteId: 'website-id' };

function script(consent: 'essential' | 'analytics' | null, pathname = '/nl/kalender') {
  return analyticsScript({ config, consent, pathname });
}

/**
 * Draait het inline script dat in de HTML terechtkomt, met een nagebootste
 * `window` en `location`. Zo controleren we de echte browserfilter en niet een
 * tweede, Nederlandstalige herformulering ervan.
 */
function runFilter(url: string): unknown {
  const target = new URL(url, 'https://vtk.be');
  const win: Record<string, (type: string, payload: unknown) => unknown> = {};
  new Function('window', 'location', analyticsFilterSource())(win, target);
  return win[ANALYTICS_BEFORE_SEND_FUNCTION]('event', { url: target.toString() });
}

describe('toestemming', () => {
  it('laadt geen script zonder keuze', () => {
    expect(script(null)).toBeNull();
  });

  it('laadt geen script wanneer enkel noodzakelijke cookies zijn toegestaan', () => {
    expect(script('essential')).toBeNull();
  });

  it('laadt het script na toestemming', () => {
    expect(script('analytics')).toMatchObject({
      src: 'https://stats.vtk.be/script.js',
      websiteId: 'website-id',
      beforeSend: ANALYTICS_BEFORE_SEND_FUNCTION,
    });
  });

  it('laadt niets zonder configuratie, ook niet met toestemming', () => {
    expect(analyticsScript({ config: null, consent: 'analytics', pathname: '/nl' })).toBeNull();
  });

  // `/scan` slaat de locale-rewrite in proxy.ts over en heeft dus geen
  // `x-pathname`; de layout geeft dan een lege string door. Die mag niet door de
  // uitsluiting glippen omdat ze toevallig op geen enkel patroon matcht.
  it('laadt niets wanneer het pad onbekend is', () => {
    for (const pathname of ['', '   ']) {
      expect(analyticsScript({ config, consent: 'analytics', pathname })).toBeNull();
    }
  });
});

describe('configuratie uit de omgeving', () => {
  it('is leeg zolang een van beide waarden ontbreekt', () => {
    expect(analyticsConfigFromEnv({})).toBeNull();
    expect(analyticsConfigFromEnv({ UMAMI_PUBLIC_URL: 'https://stats.vtk.be' })).toBeNull();
    expect(analyticsConfigFromEnv({ UMAMI_WEBSITE_ID: 'website-id' })).toBeNull();
    expect(
      analyticsConfigFromEnv({ UMAMI_PUBLIC_URL: '  ', UMAMI_WEBSITE_ID: '  ' }),
    ).toBeNull();
  });

  it('haalt de afsluitende slash weg zodat de script-URL niet dubbel slasht', () => {
    expect(
      analyticsConfigFromEnv({
        UMAMI_PUBLIC_URL: 'https://stats.vtk.be/',
        UMAMI_WEBSITE_ID: ' website-id ',
      }),
    ).toEqual({ url: 'https://stats.vtk.be', websiteId: 'website-id' });
  });
});

describe('uitgesloten paden', () => {
  const excluded = [
    '/admin',
    '/admin/inhoud',
    '/nl/admin',
    '/en/admin/tickets',
    '/scan',
    '/scan/42',
    '/tickets/bestelling/abc123',
    '/en/tickets/bestelling/abc123',
    '/admin/',
    '/admin?tab=it',
  ];
  const measured = ['/', '/nl', '/nl/kalender', '/tickets', '/tickets/gala', '/administratie'];

  it.each(excluded)('meet %s niet', (pathname) => {
    expect(isExcludedFromAnalytics(pathname)).toBe(true);
    expect(script('analytics', pathname)).toBeNull();
  });

  it.each(measured)('meet %s wel', (pathname) => {
    expect(isExcludedFromAnalytics(pathname)).toBe(false);
    expect(script('analytics', pathname)).not.toBeNull();
  });

  it('dekt elk taalvoorvoegsel waarop dezelfde pagina rendert', () => {
    expect(excludedAnalyticsPaths()).toEqual(
      expect.arrayContaining(['/admin', '/nl/admin', '/en/admin', '/scan', '/nl/scan', '/en/scan']),
    );
  });

  it.each(excluded)('laat de browserfilter %s vallen na een client-side navigatie', (pathname) => {
    expect(runFilter(pathname)).toBe(false);
  });

  it.each(measured)('laat de browserfilter %s door', (pathname) => {
    expect(runFilter(pathname)).toBeTruthy();
  });
});

describe('magazines per nummer meten', () => {
  it('geeft elk nummer een eigen leesbaar adres', () => {
    // Zonder dit ziet een redactie enkel dat /media bezocht is, en niet welk
    // nummer er gelezen werd; dat was de hele reden om Umami te draaien.
    expect(magazineViewUrl({ kind: 'bakske', id: 'bakske-2025-2026-s2w6' })).toBe(
      '/media/bakske/2025-2026-s2w6'
    );
    expect(magazineViewUrl({ kind: 'ir-reeel', id: 'ir-reeel-2025-september' })).toBe(
      '/media/ir-reeel/2025-september'
    );
  });

  it('herhaalt de soort niet in het adres', () => {
    const url = magazineViewUrl({ kind: 'bakske', id: 'bakske-2025-2026-s2w6' });
    expect(url).not.toContain('bakske/bakske');
  });

  it('laat een id die niet met de soort begint ongemoeid', () => {
    expect(magazineViewUrl({ kind: 'bakske', id: 'kerstnummer' })).toBe('/media/bakske/kerstnummer');
  });

  it('eindigt nooit op een slash', () => {
    // Een id die exact de soort is, zou anders `/media/bakske/` opleveren en in
    // Umami naast `/media/bakske` als een tweede regel gaan staan.
    expect(magazineViewUrl({ kind: 'bakske', id: 'bakske' })).toBe('/media/bakske/bakske');
    expect(magazineViewUrl({ kind: 'bakske', id: 'bakske-' })).not.toMatch(/\/$/);
  });

  it('zet publicatie en nummer in de titel', () => {
    expect(
      magazineViewTitle({ publicationTitle: "'t Bakske", issueLabel: 'Semester 2, week 6' })
    ).toBe("'t Bakske - Semester 2, week 6");
  });

  it('laat het streepje weg wanneer een nummer geen label heeft', () => {
    expect(magazineViewTitle({ publicationTitle: 'Ir.Reëel', issueLabel: '  ' })).toBe('Ir.Reëel');
  });
});

describe('attributen voor een meetbare klik', () => {
  it('zet naam en gegevens als data-attributen', () => {
    expect(umamiEvent('externe-link', { bestemming: 'career.vtk.be', vanaf: 'menu' })).toEqual({
      'data-umami-event': 'externe-link',
      'data-umami-event-bestemming': 'career.vtk.be',
      'data-umami-event-vanaf': 'menu',
    });
  });

  it('laat lege waarden weg', () => {
    // Een leeg attribuut vult het rapport met ruis zonder iets te zeggen.
    expect(umamiEvent('download', { pagina: 'shiften', bestand: '  ' })).toEqual({
      'data-umami-event': 'download',
      'data-umami-event-pagina': 'shiften',
    });
    expect(umamiEvent('download', { pagina: null })).toEqual({ 'data-umami-event': 'download' });
  });

  it('maakt van een sleutel iets dat de tracker kan lezen', () => {
    // Het script leest gegevens uit met /data-umami-event-([\w-_]+)/. Een sleutel
    // met een accent of een spatie wordt stil genegeerd, en dan ontbreekt het
    // cijfer zonder dat iets kapot lijkt.
    const attributes = umamiEvent('test', { 'Vanaf Café': 'x' });
    expect(Object.keys(attributes)).toContain('data-umami-event-vanaf-cafe');
  });

  it('trimt de waarde', () => {
    expect(umamiEvent('test', { a: '  b  ' })['data-umami-event-a']).toBe('b');
  });
});

describe('bestemming van een externe link', () => {
  it('houdt de hostnaam over', () => {
    // De volledige URL zou het rapport vullen met varianten van hetzelfde adres.
    expect(outboundHost('https://career.vtk.be/jobs?x=1')).toBe('career.vtk.be');
    expect(outboundHost('https://cudi.vtk.be/vtk/shop')).toBe('cudi.vtk.be');
  });

  it('geeft een lege waarde bij een adres dat niet te lezen valt', () => {
    // Dan valt het attribuut weg in plaats van er iets zinloos in te zetten.
    expect(outboundHost('')).toBe('');
    expect(outboundHost('ht tp://kapot')).toBe('');
    // Een pad op deze site is geen externe bestemming; zonder deze regel telde
    // de knop op een pagina mee als een klik naar buiten.
    expect(outboundHost('/en/shift')).toBe('');
    expect(outboundHost('mailto:info@vtk.be')).toBe('');
  });
});
