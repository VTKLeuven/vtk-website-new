import { describe, expect, it } from 'vitest';
import {
  headingId,
  headingText,
  outlineFromMarkdown,
  outlineFromTiptap,
} from '@/lib/pageOutline';

describe('kopjes van een contentpagina', () => {
  it('neemt H2 en H3 op, maar niet H1 of dieper', () => {
    const outline = outlineFromMarkdown(
      ['# Titel', '## Inschrijven', 'tekst', '### Ruilen', '#### Detail'].join('\n')
    );
    expect(outline).toEqual([
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
      { id: 'sectie-hoe-schrijf-je-in', text: 'Hoe schrijf je in', level: 2 },
    ]);
  });

  it('vlakt geneste React-children af tot platte tekst', () => {
    const children = ['Bonnetjes ', { props: { children: ['en ', 'ruilen'] } }];
    expect(headingText(children)).toBe('Bonnetjes en ruilen');
  });
});
