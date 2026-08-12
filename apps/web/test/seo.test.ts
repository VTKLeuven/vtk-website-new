import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_DESCRIPTION_LENGTH,
  SITE_DESCRIPTION,
  SITE_TITLE_TEMPLATE,
  buildMetadata,
  canonicalPath,
  hreflangAlternates,
  localizedPath,
  siteUrl,
  truncateDescription,
} from '@/lib/seo';

const BASE = 'https://vtk.be';

beforeEach(() => {
  process.env.VTK_MAIN_URL = BASE;
});

afterEach(() => {
  delete process.env.VTK_MAIN_URL;
});

describe('basis-URL', () => {
  it('neemt de publieke URL uit de omgeving, zonder pad of slash', () => {
    process.env.VTK_MAIN_URL = 'https://vtk.be/';
    expect(siteUrl()).toBe('https://vtk.be');
  });

  it('valt terug op localhost wanneer de omgeving onzin bevat', () => {
    process.env.VTK_MAIN_URL = 'niet-een-url';
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});

describe('canonieke paden', () => {
  it('haalt het /nl-voorvoegsel eraf, want die vorm rendert dezelfde pagina', () => {
    expect(canonicalPath('/nl/kalender')).toBe('/kalender');
    expect(canonicalPath('/nl/kalender/')).toBe('/kalender');
    expect(canonicalPath('/nl')).toBe('/');
  });

  it('haalt ook het /en-voorvoegsel eraf en normaliseert de root', () => {
    expect(canonicalPath('/en/p/theokot')).toBe('/p/theokot');
    expect(canonicalPath('/en')).toBe('/');
    expect(canonicalPath('/')).toBe('/');
  });

  it('laat een segment dat toevallig met de taalcode begint met rust', () => {
    expect(canonicalPath('/nlbox')).toBe('/nlbox');
    expect(canonicalPath('/english')).toBe('/english');
  });

  it('negeert query en fragment', () => {
    expect(canonicalPath('/nl/kalender?maand=3#top')).toBe('/kalender');
  });

  it('zet Nederlands op de voorvoegselloze URL en Engels onder /en', () => {
    expect(localizedPath('/nl/kalender', 'nl')).toBe('/kalender');
    expect(localizedPath('/kalender', 'en')).toBe('/en/kalender');
    expect(localizedPath('/', 'en')).toBe('/en');
    expect(localizedPath('/en', 'nl')).toBe('/');
  });
});

describe('hreflang', () => {
  it('levert nl, en en x-default, met x-default op het Nederlands', () => {
    const alternates = hreflangAlternates('/nl/kalender');
    expect(alternates).toEqual({
      nl: 'https://vtk.be/kalender',
      en: 'https://vtk.be/en/kalender',
      'x-default': 'https://vtk.be/kalender',
    });
  });

  it('geeft hetzelfde paar terug vanuit welke URL-vorm je ook vertrekt', () => {
    expect(hreflangAlternates('/en/kalender')).toEqual(hreflangAlternates('/kalender'));
  });
});

describe('beschrijving', () => {
  it('trekt witruimte samen en laat korte tekst ongemoeid', () => {
    expect(truncateDescription('  Twee   regels\ntekst ')).toBe('Twee regels tekst');
  });

  it('kapt af op een woordgrens en zet er een beletselteken achter', () => {
    const long = 'woord '.repeat(60);
    const result = truncateDescription(long);
    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('woor…');
  });

  it('kapt een enkel lang woord alsnog af in plaats van het te laten staan', () => {
    const result = truncateDescription('a'.repeat(400));
    expect(result.length).toBe(MAX_DESCRIPTION_LENGTH);
  });

  it('laat geen leesteken voor het beletselteken staan', () => {
    const text = `${'x'.repeat(155)}, nog veel meer tekst erachter`;
    const result = truncateDescription(text);
    expect(result).not.toContain(',…');
    expect(result).toBe(`${'x'.repeat(155)}…`);
  });
});

describe('buildMetadata', () => {
  const input = { title: 'Kalender', path: '/nl/kalender', locale: 'nl' as const };

  it('wijst de canonical altijd naar de voorvoegselloze NL-URL', () => {
    expect(buildMetadata(input).alternates?.canonical).toBe('https://vtk.be/kalender');
    expect(buildMetadata({ ...input, path: '/kalender' }).alternates?.canonical).toBe(
      'https://vtk.be/kalender',
    );
  });

  it('wijst de canonical van de Engelse pagina naar /en', () => {
    const meta = buildMetadata({ ...input, locale: 'en', path: '/kalender' });
    expect(meta.alternates?.canonical).toBe('https://vtk.be/en/kalender');
  });

  it('zet op beide talen hetzelfde, volledige hreflang-paar', () => {
    const nl = buildMetadata(input).alternates?.languages;
    const en = buildMetadata({ ...input, locale: 'en' }).alternates?.languages;
    expect(nl).toEqual(en);
    expect(Object.keys(nl ?? {})).toEqual(['nl', 'en', 'x-default']);
  });

  it('houdt de titel kaal, want de root layout plakt de sitenaam eraan', () => {
    expect(SITE_TITLE_TEMPLATE).toBe('%s · VTK');
    expect(buildMetadata(input).title).toBe('Kalender');
  });

  it('kapt de beschrijving af en valt terug op de sitebeschrijving', () => {
    expect(buildMetadata(input).description).toBe(truncateDescription(SITE_DESCRIPTION));
    const long = buildMetadata({ ...input, description: 'lang '.repeat(80) });
    expect((long.description ?? '').length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
  });

  it('vult OG en Twitter met dezelfde titel, beschrijving en beeld', () => {
    const meta = buildMetadata({ ...input, description: 'Alle activiteiten van VTK.' });
    expect(meta.openGraph?.url).toBe('https://vtk.be/kalender');
    expect(meta.openGraph?.title).toBe('Kalender');
    expect(meta.openGraph?.description).toBe('Alle activiteiten van VTK.');
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Kalender',
      description: 'Alle activiteiten van VTK.',
    });
  });

  it('valt terug op de standaard-OG-afbeelding en maakt elk beeld absoluut', () => {
    const fallback = buildMetadata(input).openGraph?.images;
    expect(fallback).toEqual([
      {
        url: 'https://vtk.be/opengraph-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Kalender',
      },
    ]);

    const relative = buildMetadata({ ...input, image: '/media/foto.jpg' }).openGraph?.images;
    expect(relative).toEqual([
      expect.objectContaining({ url: 'https://vtk.be/media/foto.jpg' }),
    ]);

    const remote = buildMetadata({ ...input, image: 'https://cdn.vtk.be/foto.jpg' }).openGraph
      ?.images;
    expect(remote).toEqual([expect.objectContaining({ url: 'https://cdn.vtk.be/foto.jpg' })]);
  });

  it('zet de datums enkel op inhoud van het type article', () => {
    const article = buildMetadata({
      ...input,
      type: 'article',
      publishedTime: new Date('2026-03-01T10:00:00.000Z'),
    });
    expect(article.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-03-01T10:00:00.000Z',
    });
    expect(buildMetadata(input).openGraph).toMatchObject({ type: 'website' });
  });

  it('sluit een pagina op verzoek uit de zoekresultaten', () => {
    expect(buildMetadata(input).robots).toBeUndefined();
    expect(buildMetadata({ ...input, noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
