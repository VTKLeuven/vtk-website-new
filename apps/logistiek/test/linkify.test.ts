import { describe, expect, it } from 'vitest';
import { hasLink, linkify } from '@/lib/linkify';

describe('linkify', () => {
  it('laat tekst zonder adres met rust', () => {
    expect(linkify('20 bakken en 4 tafels')).toEqual([
      { kind: 'text', value: '20 bakken en 4 tafels' },
    ]);
  });

  it('haalt een volledig adres uit de zin', () => {
    const chunks = linkify('Zie https://logistiek.vtk.be/beheer/aanvragen/abc voor de lijst');
    expect(chunks).toEqual([
      { kind: 'text', value: 'Zie ' },
      {
        kind: 'link',
        value: 'https://logistiek.vtk.be/beheer/aanvragen/abc',
        href: 'https://logistiek.vtk.be/beheer/aanvragen/abc',
        internal: false,
      },
      { kind: 'text', value: ' voor de lijst' },
    ]);
  });

  it('laat een punt aan het eind van de zin buiten de link', () => {
    const chunks = linkify('Lijst: https://vtk.be/lijst.');
    expect(chunks[1]).toMatchObject({ kind: 'link', href: 'https://vtk.be/lijst' });
    expect(chunks[2]).toEqual({ kind: 'text', value: '.' });
  });

  it('herkent een pad op deze site als interne link', () => {
    const chunks = linkify('materiaallijst: /beheer/aanvragen/abc');
    expect(chunks[1]).toEqual({
      kind: 'link',
      value: '/beheer/aanvragen/abc',
      href: '/beheer/aanvragen/abc',
      internal: true,
    });
  });

  it('maakt van een schuine streep midden in een woord geen link', () => {
    expect(hasLink('4 tafels en/of 2 banken')).toBe(false);
  });

  it('herkent meerdere adressen na elkaar', () => {
    const chunks = linkify('https://a.be/1 en https://b.be/2');
    expect(chunks.filter((chunk) => chunk.kind === 'link')).toHaveLength(2);
  });
});
