import { describe, expect, it } from 'vitest';
import type { Element, ElementContent } from 'hast';
import { galleryPhotos, imageSize, withImageSize } from '@/lib/gallery';

function img(src: string, alt = ''): ElementContent {
  return { type: 'element', tagName: 'img', properties: { src, alt }, children: [] };
}

function text(value: string): ElementContent {
  return { type: 'text', value };
}

function paragraph(...children: ElementContent[]): Element {
  return { type: 'element', tagName: 'p', properties: {}, children };
}

describe('maten in de URL van een afbeelding', () => {
  it('leest de maten die de uploadroute meeschreef', () => {
    expect(imageSize('/api/media/images/foto.jpg?w=1600&h=1067')).toEqual({
      width: 1600,
      height: 1067,
    });
  });

  it('geeft null zonder maten of bij onzin', () => {
    expect(imageSize('/api/media/images/foto.jpg')).toBeNull();
    expect(imageSize('/foto.jpg?w=1600')).toBeNull();
    expect(imageSize('/foto.jpg?w=0&h=100')).toBeNull();
    expect(imageSize('/foto.jpg?w=-1600&h=1067')).toBeNull();
    expect(imageSize('/foto.jpg?w=breed&h=hoog')).toBeNull();
    // Een foto van 40k pixels breed bestaat niet; dan staat er iets anders in.
    expect(imageSize('/foto.jpg?w=40000&h=1067')).toBeNull();
  });

  it('hangt de maten achter een bestaande query in plaats van een tweede vraagteken', () => {
    expect(withImageSize('/api/media/images/foto.jpg', 800, 600)).toBe(
      '/api/media/images/foto.jpg?w=800&h=600'
    );
    expect(withImageSize('/api/media/images/foto.jpg?v=2', 800, 600)).toBe(
      '/api/media/images/foto.jpg?v=2&w=800&h=600'
    );
  });
});

describe('foto’s die tegen elkaar aan staan', () => {
  it('maakt van twee of meer afbeeldingen een galerij', () => {
    const photos = galleryPhotos(
      paragraph(img('/a.jpg?w=600&h=400', 'Eerste'), text('\n'), img('/b.jpg?w=400&h=600'))
    );

    expect(photos).toEqual([
      { src: '/a.jpg?w=600&h=400', alt: 'Eerste', width: 600, height: 400 },
      { src: '/b.jpg?w=400&h=600', alt: '', width: 400, height: 600 },
    ]);
  });

  it('laat een enkele foto een gewone afbeelding in de tekst', () => {
    expect(galleryPhotos(paragraph(img('/a.jpg?w=600&h=400')))).toBeNull();
  });

  it('laat een alinea met tekst ertussen een alinea', () => {
    expect(
      galleryPhotos(paragraph(img('/a.jpg'), text(' en dan '), img('/b.jpg')))
    ).toBeNull();
  });

  it('houdt video’s erbuiten, ook naast een foto', () => {
    expect(
      galleryPhotos(
        paragraph(
          img('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Video'),
          text('\n'),
          img('/b.jpg?w=600&h=400')
        )
      )
    ).toBeNull();
  });

  it('geeft de foto’s zonder maten terug; de galerij valt dan terug op een raster', () => {
    const photos = galleryPhotos(paragraph(img('/oud-1.jpg'), text('\n'), img('/oud-2.jpg')));

    expect(photos).toEqual([
      { src: '/oud-1.jpg', alt: '', width: null, height: null },
      { src: '/oud-2.jpg', alt: '', width: null, height: null },
    ]);
  });

  it('stopt bij alles wat geen afbeelding is', () => {
    const link: ElementContent = {
      type: 'element',
      tagName: 'a',
      properties: { href: '/ergens' },
      children: [],
    };

    expect(galleryPhotos(paragraph(img('/a.jpg'), link, img('/b.jpg')))).toBeNull();
    expect(galleryPhotos(undefined)).toBeNull();
  });
});
