import { describe, expect, it } from 'vitest';
import { describeLink, hasLink, linkify } from '@/lib/linkify';

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

describe('describeLink', () => {
  it('noemt een Google Sheet gewoon een Google Sheet', () => {
    expect(describeLink('https://docs.google.com/spreadsheets/d/1AbCdEf/edit#gid=0')).toEqual({
      kind: 'sheet',
      label: 'Google Sheet',
    });
  });

  it('herkent de andere bestanden van Google', () => {
    expect(describeLink('https://docs.google.com/document/d/1x/edit').kind).toBe('doc');
    expect(describeLink('https://docs.google.com/presentation/d/1x/edit').kind).toBe('slides');
    expect(describeLink('https://forms.gle/abc').kind).toBe('form');
    expect(describeLink('https://drive.google.com/file/d/1x/view').kind).toBe('drive');
  });

  it('noemt de materiaallijst van een aanvraag een aanvraag', () => {
    expect(describeLink('/beheer/aanvragen/abc')).toEqual({ kind: 'request', label: 'Aanvraag' });
    expect(describeLink('/beheer/aanvragen/abc', 'en').label).toBe('Request');
  });

  it('noemt een bestand bij zijn naam als die kort is, anders bij zijn soort', () => {
    expect(describeLink('https://vtk.be/files/materiaallijst.pdf')).toEqual({ kind: 'file', label: 'materiaallijst.pdf' });
    expect(describeLink('https://vtk.be/files/Materiaallijst%20Winterbar.pdf').label).toBe('Materiaallijst Winterbar.pdf');
    expect(
      describeLink('https://cdn.example.com/u/2026/11/materiaallijst-winterbar-ladeuzeplein-definitief.pdf?dl=1').label
    ).toBe('PDF');
    expect(describeLink('https://example.com/lijst.xlsx').kind).toBe('file');
  });

  it('noemt OneDrive en Dropbox bij hun naam', () => {
    expect(describeLink('https://kuleuven-my.sharepoint.com/:x:/g/personal/abc/EaBcD?e=xyz').label).toBe('OneDrive');
    expect(describeLink('https://1drv.ms/x/s!AbCdEf').label).toBe('OneDrive');
    expect(describeLink('https://www.dropbox.com/scl/fi/abc/lijst?rlkey=x').label).toBe('Dropbox');
  });

  it('houdt een lang domein kort', () => {
    expect(describeLink('https://heel-lang-subdomein-van-iets.voorbeeld.be/a/b/c').label).toBe('voorbeeld.be');
  });

  it('toont nooit een lang adres, ook geen lang pad op deze site', () => {
    const long = describeLink('/beheer/vervoer/week?vanaf=2026-11-16&voertuig=kar&chauffeur=abc');
    expect(long.label.length).toBeLessThanOrEqual(28);
  });

  it('toont van een ander adres enkel de site', () => {
    expect(describeLink('https://www.colruyt.be/nl/producten/123')).toEqual({ kind: 'web', label: 'colruyt.be' });
  });

  it('laat een ander pad op deze site staan zoals het is', () => {
    expect(describeLink('/beheer/vervoer')).toEqual({ kind: 'page', label: '/beheer/vervoer' });
  });
});
