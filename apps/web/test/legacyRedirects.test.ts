import { describe, expect, it } from 'vitest';
import {
  LEGACY_CATEGORIES,
  LEGACY_LOCALES,
  LEGACY_REDIRECTS,
  type LegacyRedirect,
} from '@/lib/legacyRedirects';

/**
 * Een miniatuurversie van de patroontaal die Next voor `redirects()` gebruikt:
 * `:naam`, `:naam(regex)` en `:naam*`. Genoeg om te controleren welke regel een
 * oude URL vangt en waar ze uitkomt, zonder de dev-server op te starten.
 */
function compile(source: string): { pattern: RegExp; params: string[] } {
  const params: string[] = [];
  let pattern = '';

  for (const segment of source.split('/').slice(1)) {
    const match = /^:([A-Za-z0-9_]+)(?:\((.+)\))?([*+?])?$/.exec(segment);
    if (!match) {
      pattern += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      continue;
    }
    const [, name, group, modifier] = match;
    params.push(name);
    const body = group ?? '[^/]+';
    pattern += modifier === '*' ? `(?:/(${body}(?:/[^/]+)*))?` : `/(${body})`;
  }

  return { pattern: new RegExp(`^${pattern}$`), params };
}

/** De eerste regel die matcht wint, net zoals in de configuratie. */
function resolve(pathname: string): { rule: LegacyRedirect; destination: string } | null {
  for (const rule of LEGACY_REDIRECTS) {
    const { pattern, params } = compile(rule.source);
    const match = pattern.exec(pathname);
    if (!match) continue;

    let destination = rule.destination;
    params.forEach((name, index) => {
      destination = destination.replaceAll(`:${name}`, match[index + 1] ?? '');
    });
    return { rule, destination };
  }
  return null;
}

describe('vorm van de map', () => {
  it('bevat geen dubbel bronpatroon', () => {
    const sources = LEGACY_REDIRECTS.map((rule) => rule.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('vertrekt altijd van een oud adres met taalvoorvoegsel', () => {
    for (const rule of LEGACY_REDIRECTS) {
      expect(rule.source, rule.source).toMatch(/^\/(nl|en)\//);
    }
  });

  it('landt op een voorvoegselloze NL-URL, een /en-URL of een externe site', () => {
    for (const rule of LEGACY_REDIRECTS) {
      const isExternal = rule.destination.startsWith('https://');
      expect(isExternal || rule.destination.startsWith('/'), rule.destination).toBe(true);
      // Het /nl-voorvoegsel moet eraf: anders houden we de duplicate content in
      // stand die de canonicals net wegwerken.
      expect(rule.destination.startsWith('/nl/'), rule.destination).toBe(false);
      expect(rule.destination).not.toBe('/nl');
    }
  });

  it('stuurt een oud adres nooit naar zichzelf', () => {
    for (const rule of LEGACY_REDIRECTS) {
      expect(rule.destination).not.toBe(rule.source);
    }
  });
});

describe('infopagina’s', () => {
  it('houdt de slug en verhuist /page naar /p', () => {
    expect(resolve('/nl/page/theokot')?.destination).toBe('/p/theokot');
    expect(resolve('/en/page/theokot')?.destination).toBe('/en/p/theokot');
  });

  it('verwijst permanent, want de slugs zijn ongewijzigd meeverhuisd', () => {
    expect(resolve('/nl/page/theokot')?.rule.permanent).toBe(true);
  });
});

describe('categorieën', () => {
  it('heeft voor elk van de acht categorieën uit de navigatie een regel', () => {
    for (const locale of LEGACY_LOCALES) {
      for (const [name, target] of Object.entries(LEGACY_CATEGORIES)) {
        const to = locale === 'en' ? `/en${target}` : target;
        expect(resolve(`/${locale}/category/${name}`)?.destination, name).toBe(to);
      }
    }
  });

  it('dekt ook de kleingeschreven vorm', () => {
    expect(resolve('/nl/category/aanbod')?.destination).toBe('/info');
    expect(resolve('/nl/category/over-vtk')?.destination).toBe('/over-vtk');
    expect(resolve('/en/category/cursusdienst')?.destination).toBe('/en/cursusdienst');
  });

  it('laat een onbekende categorie met rust in plaats van ze ergens te dumpen', () => {
    expect(resolve('/nl/category/Bestaatniet')).toBeNull();
  });

  it('bedient precies de acht categorieën van de echte navigatie', () => {
    expect(Object.keys(LEGACY_CATEGORIES).sort()).toEqual([
      'Aanbod',
      'Career',
      'Cursusdienst',
      'Eerstejaars',
      'Internationaal',
      'Media',
      'Over-VTK',
      'Studies',
    ]);
  });
});

describe('kalender, shiften en de externe sites', () => {
  it('brengt de oude kalender naar /kalender', () => {
    expect(resolve('/nl/calendar')?.destination).toBe('/kalender');
    expect(resolve('/en/calendar')?.destination).toBe('/en/kalender');
  });

  it('brengt een oude evenement-URL naar het overzicht, tijdelijk', () => {
    const hit = resolve('/nl/calendar/view/2024-03-12_galabal');
    expect(hit?.destination).toBe('/kalender');
    // De slug van het evenement is niet meegemigreerd, dus dit is een gok op de
    // bestemming; liever een 307 dan een 308 die we een jaar niet terugdraaien.
    expect(hit?.rule.permanent).toBe(false);
  });

  it('brengt registration-shift naar /shift', () => {
    expect(resolve('/nl/registration-shift')?.destination).toBe('/shift');
    expect(resolve('/en/registration-shift')?.destination).toBe('/en/shift');
  });

  it('stuurt corporate en cudi naar hun eigen site', () => {
    expect(resolve('/nl/corporate')?.destination).toBe('https://career.vtk.be');
    expect(resolve('/en/corporate')?.destination).toBe('https://career.vtk.be');
    expect(resolve('/nl/cudi/retail')?.destination).toBe('https://cudi.vtk.be/vtk/shop');
    expect(resolve('/nl/cudi/booking/book')?.destination).toBe('https://cudi.vtk.be');
    expect(resolve('/en/cudi/booking/book')?.destination).toBe('https://cudi.vtk.be');
  });
});

describe('het /nl-voorvoegsel eraf', () => {
  it('haalt het voorvoegsel weg bij paden die hun naam houden', () => {
    expect(resolve('/nl/privacy')?.destination).toBe('/privacy');
    expect(resolve('/nl/shift')?.destination).toBe('/shift');
    expect(resolve('/nl/contact')?.destination).toBe('/contact');
  });

  it('laat de Engelse tegenhangers ongemoeid, die staan al goed', () => {
    expect(resolve('/en/privacy')).toBeNull();
    expect(resolve('/en/shift')).toBeNull();
    expect(resolve('/en/contact')).toBeNull();
  });
});

describe('geen lussen', () => {
  // proxy.ts rewrit een voorvoegselloos pad intern naar /nl/..., dus een
  // bestemming die opnieuw een bron zou matchen, kan blijven pingpongen.
  it('matcht geen enkele bestemming opnieuw een bronpatroon', () => {
    for (const rule of LEGACY_REDIRECTS) {
      if (rule.destination.startsWith('https://')) continue;
      const concrete = rule.destination.replace(/:[A-Za-z0-9_]+\*?/g, 'voorbeeld');
      expect(resolve(concrete), `${rule.source} -> ${concrete}`).toBeNull();
    }
  });

  it('laat de nieuwe adressen zelf ongemoeid', () => {
    for (const path of ['/', '/p/theokot', '/kalender', '/shift', '/privacy', '/info', '/en/info']) {
      expect(resolve(path), path).toBeNull();
    }
  });
});
