import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  contentPageMetadata,
  eventDescription,
  firstImageFromMarkdown,
  firstImageFromTiptap,
  pageDescription,
  pageImage,
  pageTitle,
  staticMetadata,
  type MetadataEvent,
  type MetadataPage,
} from '@/lib/pageMetadata';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const BASE = 'https://vtk.be';

beforeEach(() => {
  process.env.VTK_MAIN_URL = BASE;
});

afterEach(() => {
  delete process.env.VTK_MAIN_URL;
});

function page(overrides: Partial<MetadataPage> = {}): MetadataPage {
  return {
    titleNl: 'Theokot',
    titleEn: null,
    excerptNl: null,
    excerptEn: null,
    contentMdNl: null,
    contentMdEn: null,
    contentJsonNl: null,
    contentJsonEn: null,
    publishedAt: new Date('2026-01-05T09:00:00.000Z'),
    contentEditedAt: null,
    ...overrides,
  };
}

describe('titel van een contentpagina', () => {
  it('neemt de Engelse titel wanneer die er is', () => {
    expect(pageTitle(page({ titleEn: 'Sandwich bar' }), 'en')).toBe('Sandwich bar');
  });

  it('valt terug op het Nederlands wanneer de Engelse titel ontbreekt of leeg is', () => {
    expect(pageTitle(page(), 'en')).toBe('Theokot');
    expect(pageTitle(page({ titleEn: '' }), 'en')).toBe('Theokot');
  });
});

describe('beschrijving van een contentpagina', () => {
  it('gebruikt het excerpt wanneer de redactie er een schreef', () => {
    const result = pageDescription(
      page({ excerptNl: 'Elke middag broodjes in het kasteel.', contentMdNl: '# Theokot' }),
      'nl',
    );
    expect(result).toBe('Elke middag broodjes in het kasteel.');
  });

  it('valt terug op het Nederlandse excerpt wanneer het Engelse ontbreekt', () => {
    const result = pageDescription(page({ excerptNl: 'Broodjes in het kasteel.' }), 'en');
    expect(result).toBe('Broodjes in het kasteel.');
  });

  it('valt zonder excerpt terug op de tekst zelf, zonder opmaakruis', () => {
    const result = pageDescription(
      page({ contentMdNl: '## Broodjes\n\nEen **vers** broodje kost [1,50 euro](/prijzen).' }),
      'nl',
    );
    expect(result).toBe('Broodjes Een vers broodje kost 1,50 euro.');
  });

  it('beschrijft de tekst die de bezoeker te zien krijgt, ook bij de NL-terugval', () => {
    // Geen Engelse versie: PageView toont de Nederlandse tekst, dus de
    // beschrijving hoort die tekst te zijn en niet een lege string.
    const result = pageDescription(page({ contentMdNl: 'Broodjes in het kasteel.' }), 'en');
    expect(result).toBe('Broodjes in het kasteel.');
  });

  it('gebruikt de Engelse tekst zodra die bestaat', () => {
    const result = pageDescription(
      page({ contentMdNl: 'Broodjes in het kasteel.', contentMdEn: 'Sandwiches in the castle.' }),
      'en',
    );
    expect(result).toBe('Sandwiches in the castle.');
  });
});

describe('eerste afbeelding uit markdown', () => {
  it('vindt bron en alt-tekst', () => {
    expect(firstImageFromMarkdown('tekst\n\n![De toog](/api/media/theokot.jpg)\n')).toEqual({
      src: '/api/media/theokot.jpg',
      alt: 'De toog',
    });
  });

  it('negeert de titel achter de bron', () => {
    expect(firstImageFromMarkdown('![](/a.jpg "Bijschrift")')?.src).toBe('/a.jpg');
  });

  it('neemt de eerste, niet de laatste', () => {
    expect(firstImageFromMarkdown('![een](/1.jpg) ![twee](/2.jpg)')?.src).toBe('/1.jpg');
  });

  it('trapt niet in een voorbeeld binnen een codeblok', () => {
    const markdown = '```md\n![voorbeeld](/nep.jpg)\n```\n\n![echt](/echt.jpg)';
    expect(firstImageFromMarkdown(markdown)?.src).toBe('/echt.jpg');
  });

  it('geeft null bij tekst zonder afbeelding', () => {
    expect(firstImageFromMarkdown('Gewoon een [link](/ergens).')).toBeNull();
    expect(firstImageFromMarkdown(null)).toBeNull();
  });
});

describe('eerste afbeelding uit een legacy tiptap-document', () => {
  it('graaft door de boom tot ze een image-node vindt', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Tekst' }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: '/oud.jpg', alt: 'Oud' } }] },
      ],
    };
    expect(firstImageFromTiptap(doc)).toEqual({ src: '/oud.jpg', alt: 'Oud' });
  });

  it('geeft null voor een document zonder beeld', () => {
    expect(firstImageFromTiptap({ type: 'doc', content: [{ type: 'paragraph' }] })).toBeNull();
    expect(firstImageFromTiptap(null)).toBeNull();
  });
});

describe('deelbeeld van een contentpagina', () => {
  it('volgt dezelfde taalterugval als de tekst', () => {
    const withBoth = page({
      contentMdNl: '![NL](/nl.jpg)',
      contentMdEn: '![EN](/en.jpg)',
    });
    expect(pageImage(withBoth, 'en')?.src).toBe('/en.jpg');
    expect(pageImage(page({ contentMdNl: '![NL](/nl.jpg)' }), 'en')?.src).toBe('/nl.jpg');
  });

  it('valt terug op het standaardbeeld van de site wanneer de pagina er geen heeft', () => {
    expect(pageImage(page({ contentMdNl: 'Geen beeld.' }), 'nl')).toBeNull();

    const metadata = contentPageMetadata(page({ contentMdNl: 'Geen beeld.' }), 'nl', '/info/theokot');
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${BASE}${DEFAULT_OG_IMAGE}` }),
    ]);
  });

  it('zet het paginabeeld absoluut in de metadata', () => {
    const metadata = contentPageMetadata(
      page({ contentMdNl: '![De toog](/api/media/theokot.jpg)' }),
      'nl',
      '/info/theokot',
    );
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${BASE}/api/media/theokot.jpg`, alt: 'De toog' }),
    ]);
  });
});

describe('metadata van een contentpagina', () => {
  it('is van het type article, met de laatste inhoudelijke bewerking als datum', () => {
    const metadata = contentPageMetadata(
      page({ contentEditedAt: new Date('2026-03-02T12:00:00.000Z') }),
      'nl',
      '/info/theokot',
    );
    const openGraph = metadata.openGraph as { type?: string; modifiedTime?: string };
    expect(openGraph.type).toBe('article');
    expect(openGraph.modifiedTime).toBe('2026-03-02T12:00:00.000Z');
  });

  it('wijst de canonical en de hreflang-tegenhanger naar hetzelfde pad', () => {
    const metadata = contentPageMetadata(page(), 'en', '/info/theokot');
    expect(metadata.alternates?.canonical).toBe(`${BASE}/en/info/theokot`);
    expect(metadata.alternates?.languages).toMatchObject({
      nl: `${BASE}/info/theokot`,
      en: `${BASE}/en/info/theokot`,
    });
  });
});

describe('beschrijving van een evenement', () => {
  function event(overrides: Partial<MetadataEvent> = {}): MetadataEvent {
    return {
      titleNl: 'Galabal',
      titleEn: null,
      descriptionNl: 'Het **bal** van het jaar.',
      descriptionEn: null,
      start: new Date('2026-03-14T19:00:00.000Z'),
      end: new Date('2026-03-15T02:00:00.000Z'),
      allDay: false,
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      ...overrides,
    };
  }

  it('begint met de datum en dan pas de tekst, zonder markdown-tekens', () => {
    const result = eventDescription(event(), 'nl');
    expect(result).toMatch(/^zaterdag 14 maart 2026, /);
    expect(result).toContain('Het bal van het jaar.');
    expect(result).not.toContain('**');
  });

  it('geeft bij een evenement zonder tekst enkel de datum', () => {
    expect(eventDescription(event({ descriptionNl: null }), 'nl')).toMatch(/^zaterdag 14 maart 2026/);
  });

  it('zegt bij een dagvullend evenement dat het de hele dag duurt', () => {
    expect(eventDescription(event({ allDay: true, descriptionNl: null }), 'en')).toContain('all day');
  });
});

describe('vaste routes', () => {
  it('haalt titel en beschrijving uit de dictionaries', () => {
    expect(staticMetadata('kalender', '/kalender', 'nl').title).toBe('Kalender');
    expect(staticMetadata('kalender', '/kalender', 'en').title).toBe('Calendar');
  });

  it('zet noindex enkel wanneer erom gevraagd wordt', () => {
    expect(staticMetadata('kalender', '/kalender', 'nl').robots).toBeUndefined();
    expect(staticMetadata('account', '/account', 'nl', { noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
