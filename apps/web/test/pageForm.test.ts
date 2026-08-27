import { describe, expect, it } from 'vitest';
import { FORM_MARKER, hasFormMarker, splitOnFormMarker, stripFormMarker } from '@/lib/pageForm';
import { outlineFromMarkdown } from '@/lib/pageOutline';

const PAGE = [
  '## Wat doet Sport voor jullie?',
  'VTK Sport wil jou in beweging brengen.',
  '',
  '## Interne Competitie',
  'Badminton, padel, voetbal.',
  '',
  FORM_MARKER,
  '',
  '## 24 urenloop',
  'Het grootste studentensportevenement van Leuven.',
].join('\n');

describe('waar het formulier op een contentpagina komt te staan', () => {
  it('splitst de tekst op de markering', () => {
    const { before, after } = splitOnFormMarker(PAGE);
    expect(before).toContain('## Interne Competitie');
    expect(before).not.toContain('24 urenloop');
    expect(after).toContain('## 24 urenloop');
    expect(after).not.toContain('Interne Competitie');
  });

  it('laat de markering niet als tekst achter in een van de twee helften', () => {
    const { before, after } = splitOnFormMarker(PAGE);
    expect(before).not.toContain('[[');
    expect(after).not.toContain('[[');
  });

  it('geeft after als null wanneer de markering ontbreekt: het formulier komt onderaan', () => {
    const { before, after } = splitOnFormMarker('## Enkel tekst\nzonder markering.');
    expect(after).toBeNull();
    expect(before).toContain('Enkel tekst');
  });

  it('splitst enkel op een markering die alleen op haar regel staat', () => {
    // Anders zou "gebruik [[formulier]] om te verwijzen" de pagina doormidden
    // snijden terwijl de redacteur over de markering aan het schrijven is.
    const inline = `Zet ${FORM_MARKER} in de tekst om te kiezen waar hij komt.`;
    expect(hasFormMarker(inline)).toBe(false);
    expect(splitOnFormMarker(inline).after).toBeNull();
  });

  it('herkent de markering met spaties errond en in hoofdletters', () => {
    expect(hasFormMarker('tekst\n  [[ Formulier ]]  \nmeer tekst')).toBe(true);
  });

  it('splitst op de eerste markering; een tweede blijft gewoon staan', () => {
    // Zichtbaar blijven staan is beter dan stil de verkeerde van de twee kiezen.
    const { after } = splitOnFormMarker(`een\n${FORM_MARKER}\ntwee\n${FORM_MARKER}\ndrie`);
    expect(after).toContain(FORM_MARKER);
  });

  it('haalt de markering weg wanneer er geen formulier aan de pagina hangt', () => {
    const stripped = stripFormMarker(PAGE);
    expect(stripped).not.toContain('[[');
    expect(stripped).toContain('## Interne Competitie');
    expect(stripped).toContain('## 24 urenloop');
  });

  it('laat een tekst zonder markering ongemoeid', () => {
    const plain = '## Enkel tekst\n\nzonder markering.';
    expect(stripFormMarker(plain)).toBe(plain);
  });

  it('zet het formulier in de rail op de plaats waar het in de tekst staat', () => {
    const { before, after } = splitOnFormMarker(PAGE);
    const headings = [...outlineFromMarkdown(before), ...outlineFromMarkdown(after ?? '')];
    const formIndex = outlineFromMarkdown(before).length;

    expect(headings.map((item) => item.text)).toEqual([
      'Wat doet Sport voor jullie?',
      'Interne Competitie',
      '24 urenloop',
    ]);
    // Na "Interne Competitie" en voor "24 urenloop".
    expect(formIndex).toBe(2);
  });
});
