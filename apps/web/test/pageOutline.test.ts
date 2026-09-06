import { describe, expect, it } from 'vitest';
import {
  activeAnchor,
  headingId,
  headingText,
  outlineFromMarkdown,
  outlineFromTiptap,
} from '@/lib/pageOutline';

describe('kopjes van een contentpagina', () => {
  it('neemt H1 tot en met H3 op, maar niet dieper', () => {
    const outline = outlineFromMarkdown(
      ['# Titel', '## Inschrijven', 'tekst', '### Ruilen', '#### Detail'].join('\n')
    );
    // H1 en H2 zijn hetzelfde niveau: de echte H1 van de pagina is de titel, dus
    // een `#` in de tekst is gewoon een sectiekop.
    expect(outline).toEqual([
      { id: 'sectie-titel', text: 'Titel', level: 2 },
      { id: 'sectie-inschrijven', text: 'Inschrijven', level: 2 },
      { id: 'sectie-ruilen', text: 'Ruilen', level: 3 },
    ]);
  });

  it('negeert kopjes binnen een codeblok', () => {
    const outline = outlineFromMarkdown(
      ['## Echt kopje', '```', '## geen kopje', '```', '## Ook echt'].join('\n')
    );
    expect(outline.map((item) => item.text)).toEqual(['Echt kopje', 'Ook echt']);
  });

  it('haalt opmaak uit de koptekst zodat het anker leesbaar blijft', () => {
    const outline = outlineFromMarkdown('## **Bonnetjes** en [ruilen](https://vtk.be)');
    expect(outline[0]).toEqual({
      id: 'sectie-bonnetjes-en-ruilen',
      text: 'Bonnetjes en ruilen',
      level: 2,
    });
  });

  it('geeft accenten en leestekens een bruikbaar anker', () => {
    expect(headingId('Réservaties & logistiek')).toBe('sectie-reservaties-logistiek');
    expect(headingId('!!!')).toBe('');
  });

  it('leest ook de oude tiptap-documenten', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Titel' }] },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Hoe schrijf je in' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'tekst' }] },
      ],
    };
    expect(outlineFromTiptap(doc)).toEqual([
      { id: 'sectie-titel', text: 'Titel', level: 2 },
      { id: 'sectie-hoe-schrijf-je-in', text: 'Hoe schrijf je in', level: 2 },
    ]);
  });

  it('vlakt geneste React-children af tot platte tekst', () => {
    const children = ['Bonnetjes ', { props: { children: ['en ', 'ruilen'] } }];
    expect(headingText(children)).toBe('Bonnetjes en ruilen');
  });
});

describe('welk kopje de rail markeert bij het scrollen', () => {
  // De maten van /p/sport met een formulierpaneel erin: het paneel duwt de
  // laatste drie kopjes in het laatste scherm, waar ze de leesregel nooit meer
  // halen.
  const anchors = [
    { id: 'sectie-wat-doet-sport-voor-jullie', top: 295 },
    { id: 'sectie-interne-competitie', top: 443 },
    { id: 'formulier', top: 645 },
    { id: 'sectie-24-urenloop', top: 1625 },
    { id: 'sectie-svdm', top: 1745 },
    { id: 'sectie-wanneer-precies', top: 1861 },
    { id: 'sectie-ideetjes', top: 1949 },
  ];
  const view = (scrolled: number) => ({ scrolled, maxScroll: 1606, readingLine: 120 });

  it('markeert het eerste kopje zolang je nog niets voorbij bent', () => {
    expect(activeAnchor(anchors, view(0))).toBe('sectie-wat-doet-sport-voor-jullie');
  });

  it('markeert het formulier terwijl je erin staat', () => {
    expect(activeAnchor(anchors, view(600))).toBe('formulier');
  });

  it('slaat de kopjes na het formulier niet over', () => {
    // Dit ging fout: onderaan sprong de rail van het formulier meteen naar het
    // laatste kopje, omdat de drie ertussen de leesregel nooit halen.
    const walked = [1505, 1540, 1575, 1606].map((y) => activeAnchor(anchors, view(y)));
    expect(walked).toEqual([
      'sectie-24-urenloop',
      'sectie-svdm',
      'sectie-wanneer-precies',
      'sectie-ideetjes',
    ]);
  });

  it('markeert het laatste kopje wanneer je helemaal beneden staat', () => {
    expect(activeAnchor(anchors, view(1606))).toBe('sectie-ideetjes');
  });

  it('markeert het laatste kopje ook wanneer er geen scrollruimte meer over is', () => {
    // Een korte pagina die helemaal in beeld past: springen vanuit de rail moet
    // dan nog altijd oplichten.
    const short = [
      { id: 'sectie-een', top: 300 },
      { id: 'sectie-twee', top: 500 },
    ];
    expect(activeAnchor(short, { scrolled: 0, maxScroll: 0, readingLine: 120 })).toBe(
      'sectie-twee'
    );
  });

  it('geeft null zonder ankers', () => {
    expect(activeAnchor([], view(0))).toBeNull();
  });
});
