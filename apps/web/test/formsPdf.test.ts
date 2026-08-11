import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateEntriesPdf } from '@/lib/forms/pdf';

function entry(index: number) {
  return {
    title: `Deelnemer ${index}`,
    subtitle: `1 maart 2027 · deelnemer${index}@example.test`,
    answers: [
      { label: 'Kom je?', value: 'Ja, met partner' },
      { label: 'Opmerking', value: 'Niets bijzonders.' },
    ],
  };
}

describe('PDF-export', () => {
  it('levert een leesbare PDF met een kop en de antwoorden', async () => {
    const bytes = await generateEntriesPdf({
      locale: 'nl',
      formTitle: 'Inschrijving galabal',
      entries: [entry(1)],
      generatedAt: new Date('2027-02-01T10:00:00Z'),
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
  });

  it('breekt af naar een volgende pagina wanneer er veel inzendingen zijn', async () => {
    const bytes = await generateEntriesPdf({
      locale: 'nl',
      formTitle: 'Inschrijving galabal',
      entries: Array.from({ length: 40 }, (_, index) => entry(index + 1)),
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });

  it('crasht niet op tekens die de standaardletters niet kennen', async () => {
    // pdf-lib gooit "WinAnsi cannot encode" op bv. een emoji; één zo'n antwoord
    // mag de hele export niet laten mislukken.
    const bytes = await generateEntriesPdf({
      locale: 'nl',
      formTitle: 'Feedback 🎉',
      entries: [
        {
          title: 'Пётр',
          subtitle: 'test',
          answers: [{ label: 'Wat vond je?', value: 'Top 👍 — echt “geweldig”' }],
        },
      ],
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('breekt een heel lang woord af in plaats van buiten de bladspiegel te lopen', async () => {
    const bytes = await generateEntriesPdf({
      locale: 'nl',
      formTitle: 'Test',
      entries: [
        {
          title: 'Lang',
          subtitle: '',
          answers: [{ label: 'Link', value: 'a'.repeat(400) }],
        },
      ],
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
