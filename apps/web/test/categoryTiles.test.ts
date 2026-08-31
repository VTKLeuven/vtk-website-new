import { describe, expect, it } from 'vitest';
import { categoryTiles } from '@/lib/categoryTiles';

const page = (
  id: string,
  slug: string,
  extra: Partial<{ excerptNl: string | null; imageKey: string | null }> = {}
) => ({
  id,
  slug,
  titleNl: slug,
  titleEn: null,
  excerptNl: null,
  excerptEn: null,
  imageKey: null,
  ...extra,
});

const link = (id: string, url: string, imageKey: string | null = null) => ({
  id,
  labelNl: id,
  labelEn: id,
  url,
  imageKey,
});

describe('categoryTiles', () => {
  it('toont de menu-items en pagina’s volgens hun gecombineerde volgorde', () => {
    const tiles = categoryTiles({
      slug: 'info',
      pages: [
        { ...page('p1', 'shiften'), order: 1 },
        { ...page('p2', 'uitleendienst'), order: 2 },
      ],
      links: [{ ...link('l1', '/piano'), order: 0 }],
    });

    expect(tiles.map((t) => t.href)).toEqual(['/piano', '/info/shiften', '/info/uitleendienst']);
  });

  it('markeert een andere site als extern en een pad op deze site niet', () => {
    const tiles = categoryTiles({
      slug: 'cursusdienst',
      pages: [],
      links: [link('l1', '/piano'), link('l2', 'https://cudi.vtk.be/vtk/shop')],
    });

    expect(tiles.map((t) => t.external)).toEqual([false, true]);
  });

  it('geeft elke tegel een eigen sleutel, ook als een pagina en een link hetzelfde id hebben', () => {
    // Pagina's en menu-items komen uit twee tabellen; hun cuids kunnen in
    // theorie botsen en dan zou React twee kaarten door elkaar halen.
    const tiles = categoryTiles({
      slug: 'info',
      pages: [page('same', 'shiften')],
      links: [link('same', '/piano')],
    });

    expect(new Set(tiles.map((t) => t.key)).size).toBe(2);
  });

  it('geeft een menu-item geen korte beschrijving', () => {
    // Alleen pagina's hebben een excerpt; een menu-item heeft niets om te tonen
    // en mag er ook niets van de vorige tegel bij krijgen.
    const tiles = categoryTiles({
      slug: 'info',
      pages: [page('p1', 'shiften', { excerptNl: 'Help mee achter de schermen.' })],
      links: [link('l1', '/piano')],
    });

    expect(tiles[0].excerptNl).toBe('Help mee achter de schermen.');
    expect(tiles[1].excerptNl).toBeNull();
  });

  it('geeft ook een vaste route of externe link haar eigen foto', () => {
    const tiles = categoryTiles({
      slug: 'info',
      pages: [page('p1', 'shiften', { imageKey: 'pages/shiften.jpg' })],
      links: [link('l1', '/piano', 'images/piano.jpg')],
    });

    expect(tiles[0].imageKey).toBe('pages/shiften.jpg');
    expect(tiles[1].imageKey).toBe('images/piano.jpg');
  });

  it('valt terug op de Nederlandse titel wanneer een pagina geen Engelse heeft', () => {
    const tiles = categoryTiles({ slug: 'info', pages: [page('p1', 'shiften')], links: [] });
    expect(tiles[0].labelEn).toBe('shiften');
  });
});
