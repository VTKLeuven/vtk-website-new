import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  STATIC_ROUTES,
  buildSitemapEntries,
  pagePath,
  type SitemapInput,
} from '@/lib/sitemap';

const BASE = 'https://vtk.be';

beforeEach(() => {
  process.env.VTK_MAIN_URL = BASE;
});

afterEach(() => {
  delete process.env.VTK_MAIN_URL;
});

const NOW = new Date('2026-08-08T12:00:00.000Z');

function build(overrides: Partial<SitemapInput> = {}) {
  return buildSitemapEntries({
    pages: [],
    headerTabs: [],
    events: [],
    now: NOW,
    ...overrides,
  });
}

function urls(entries: ReturnType<typeof build>) {
  return entries.map((entry) => entry.url);
}

describe('vaste routes', () => {
  it('staan er allemaal in, op de voorvoegselloze NL-URL', () => {
    const list = urls(build());
    expect(list).toEqual(STATIC_ROUTES.map((path) => `${BASE}${path}`));
    expect(list).not.toContain(`${BASE}/nl/kalender`);
  });

  it('bevat geen enkel beheerscherm of gated pad', () => {
    for (const url of urls(build())) {
      expect(url).not.toMatch(/\/(admin|scan|account|onboarding|inloggen|ledenportaal)(\/|$)/);
    }
  });

  it('geeft elke URL het volledige hreflang-paar mee', () => {
    for (const entry of build()) {
      expect(Object.keys(entry.alternates?.languages ?? {})).toEqual(['nl', 'en', 'x-default']);
    }
  });
});

describe('infopaginas', () => {
  const published = {
    slug: 'theokot',
    headerTabSlug: 'info',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    contentEditedAt: new Date('2026-05-05T00:00:00.000Z'),
    updatedAt: new Date('2026-07-07T00:00:00.000Z'),
  };

  it('laat een concept weg', () => {
    const entries = build({
      pages: [published, { ...published, slug: 'geheim', publishedAt: null }],
    });
    expect(urls(entries)).toContain(`${BASE}/info/theokot`);
    expect(urls(entries)).not.toContain(`${BASE}/info/geheim`);
  });

  it('neemt de categorie-URL als canonieke vorm, niet /p/<slug>', () => {
    expect(pagePath({ slug: 'theokot', headerTabSlug: 'info' })).toBe('/info/theokot');
    expect(pagePath({ slug: 'los', headerTabSlug: null })).toBe('/p/los');
  });

  it('neemt contentEditedAt als lastModified, met updatedAt als terugval', () => {
    const entries = build({
      pages: [published, { ...published, slug: 'zonder', contentEditedAt: null }],
    });
    expect(entries.find((e) => e.url.endsWith('/info/theokot'))?.lastModified).toEqual(
      published.contentEditedAt,
    );
    expect(entries.find((e) => e.url.endsWith('/info/zonder'))?.lastModified).toEqual(
      published.updatedAt,
    );
  });
});

describe('categorieën', () => {
  const tab = { slug: 'info', visible: true, externalUrl: null };

  it('neemt enkel zichtbare categorieën met een eigen pagina op', () => {
    const entries = build({
      headerTabs: [
        tab,
        { slug: 'verborgen', visible: false, externalUrl: null },
        { slug: 'career', visible: true, externalUrl: 'https://career.vtk.be' },
      ],
    });
    expect(urls(entries)).toContain(`${BASE}/info`);
    expect(urls(entries)).not.toContain(`${BASE}/verborgen`);
    expect(urls(entries)).not.toContain(`${BASE}/career`);
  });
});

describe('evenementen', () => {
  const base = { updatedAt: new Date('2026-06-06T00:00:00.000Z') };

  it('laat een ledenexclusief evenement weg', () => {
    const entries = build({
      events: [
        { id: 'evt-publiek', visibility: 'PUBLIC', ...base },
        { id: 'evt-leden', visibility: 'MEMBERS', ...base },
      ],
    });
    expect(urls(entries)).toContain(`${BASE}/kalender/evt-publiek`);
    expect(urls(entries)).not.toContain(`${BASE}/kalender/evt-leden`);
  });
});

describe('de sitemap als geheel', () => {
  it('bevat geen dubbele adressen', () => {
    const list = urls(
      build({
        pages: [
          {
            slug: 'theokot',
            headerTabSlug: 'info',
            publishedAt: NOW,
            contentEditedAt: null,
            updatedAt: NOW,
          },
        ],
        headerTabs: [{ slug: 'info', visible: true, externalUrl: null }],
        events: [{ id: 'evt', visibility: 'PUBLIC', updatedAt: NOW }],
      }),
    );
    expect(new Set(list).size).toBe(list.length);
  });
});
