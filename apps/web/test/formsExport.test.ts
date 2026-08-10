import { describe, expect, it } from 'vitest';
import {
  answerSummary,
  buildEntriesCsv,
  exportColumns,
  type ExportEntry,
  type ExportField,
} from '@/lib/forms/export';

function field(overrides: Partial<ExportField> & { id: string; code: string }): ExportField {
  return {
    type: 'SHORT_TEXT',
    labelNl: overrides.code,
    labelEn: null,
    sortOrder: 0,
    archivedAt: null,
    options: [],
    ...overrides,
  };
}

function entry(overrides: Partial<ExportEntry> = {}): ExportEntry {
  return {
    id: 'entry-1',
    status: 'SUBMITTED',
    reviewStatus: 'NEW',
    internalNote: null,
    submitterName: 'Jan',
    submitterEmail: 'jan@example.test',
    submittedAt: new Date('2027-03-01T18:00:00Z'),
    createdAt: new Date('2027-03-01T18:00:00Z'),
    isTest: false,
    reviewerName: null,
    answers: [],
    uploads: [],
    ...overrides,
  };
}

const answer = (fieldId: string, fieldCode: string, text: string) => ({
  fieldId,
  fieldCode,
  valueText: text,
  valueNumber: null,
  valueDate: null,
  valueBool: null,
  valueOptions: [] as string[],
});

describe('kolommen', () => {
  it('houdt de kolom van een gearchiveerd veld zolang er antwoorden op staan', () => {
    // Dit is de belofte van de hele module: een veld van het formulier halen
    // mag een bestaande export niet laten verspringen.
    const fields = [
      field({ id: 'f1', code: 'naam', sortOrder: 0 }),
      field({ id: 'f2', code: 'oude_vraag', sortOrder: 1, archivedAt: new Date() }),
    ];
    const entries = [entry({ answers: [answer('f2', 'oude_vraag', 'een antwoord')] })];

    expect(exportColumns(fields, entries, { locale: 'nl' }).map((column) => column.code)).toEqual([
      'naam',
      'oude_vraag',
    ]);
  });

  it('laat een gearchiveerd veld zonder antwoorden weg', () => {
    const fields = [
      field({ id: 'f1', code: 'naam' }),
      field({ id: 'f2', code: 'nooit_gebruikt', archivedAt: new Date() }),
    ];
    expect(
      exportColumns(fields, [entry()], { locale: 'nl' }).map((column) => column.code)
    ).toEqual(['naam']);
  });

  it('respecteert een kolomkeuze', () => {
    const fields = [field({ id: 'f1', code: 'naam' }), field({ id: 'f2', code: 'mail' })];
    expect(
      exportColumns(fields, [entry()], { locale: 'nl', fieldCodes: ['mail'] }).map((c) => c.code)
    ).toEqual(['mail']);
  });
});

describe('CSV', () => {
  it('zet de code in de kop en het antwoord in de juiste kolom', () => {
    const fields = [
      field({ id: 'f1', code: 'naam', labelNl: 'Wat is je naam?', sortOrder: 0 }),
      field({ id: 'f2', code: 'shift', labelNl: 'Welke shift?', sortOrder: 1, type: 'MULTIPLE_CHOICE', options: [
        { code: 'vroeg', labelNl: 'Vroege shift', labelEn: null },
        { code: 'laat', labelNl: 'Late shift', labelEn: null },
      ] }),
    ];
    const entries = [
      entry({
        answers: [
          answer('f1', 'naam', 'Jan'),
          { ...answer('f2', 'shift', ''), valueText: null, valueOptions: ['vroeg', 'laat'] },
        ],
      }),
    ];

    const csv = buildEntriesCsv(fields, entries, { locale: 'nl' });
    const [header, row] = csv.replace('﻿', '').trim().split('\r\n');

    expect(header).toContain('Wat is je naam? (naam)');
    expect(header).toContain('Welke shift? (shift)');
    expect(row).toContain('Jan');
    expect(row).toContain('Vroege shift | Late shift');
  });

  it('zet een cel die als formule gelezen kan worden veilig', () => {
    // createCsv doet dit, maar de export is de plek waar het echt telt: een
    // antwoord dat met = begint, mag geen formule worden in Excel.
    const fields = [field({ id: 'f1', code: 'opmerking' })];
    const entries = [entry({ answers: [answer('f1', 'opmerking', '=1+1')] })];
    expect(buildEntriesCsv(fields, entries, { locale: 'nl' })).toContain("'=1+1");
  });

  it('kan de metadatakolommen weglaten', () => {
    const fields = [field({ id: 'f1', code: 'naam' })];
    const csv = buildEntriesCsv(fields, [entry()], { locale: 'nl', includeMetadata: false });
    expect(csv).not.toContain('E-mail');
    expect(csv).toContain('naam');
  });

  it('zet de bestandsnamen van een uploadveld in zijn eigen kolom', () => {
    const fields = [field({ id: 'f1', code: 'cv', type: 'FILE' })];
    const entries = [
      entry({ uploads: [{ fieldId: 'f1', originalName: 'cv.pdf' }, { fieldId: 'f1', originalName: 'brief.pdf' }] }),
    ];
    expect(buildEntriesCsv(fields, entries, { locale: 'nl' })).toContain('cv.pdf | brief.pdf');
  });
});

describe('antwoordoverzicht', () => {
  it('telt keuzes per optie en laat open vragen weg', () => {
    const fields = [
      field({
        id: 'f1',
        code: 'shift',
        labelNl: 'Welke shift?',
        type: 'SINGLE_CHOICE',
        options: [
          { code: 'vroeg', labelNl: 'Vroeg', labelEn: null },
          { code: 'laat', labelNl: 'Laat', labelEn: null },
        ],
      }),
      field({ id: 'f2', code: 'opmerking' }),
    ];
    const entries = [
      entry({ id: 'a', answers: [{ ...answer('f1', 'shift', ''), valueOptions: ['vroeg'] }] }),
      entry({ id: 'b', answers: [{ ...answer('f1', 'shift', ''), valueOptions: ['vroeg'] }] }),
      entry({ id: 'c', answers: [{ ...answer('f1', 'shift', ''), valueOptions: ['laat'] }] }),
    ];

    const summary = answerSummary(fields, entries, 'nl');
    expect(summary).toHaveLength(1);
    expect(summary[0].total).toBe(3);
    expect(summary[0].buckets).toEqual([
      { label: 'Vroeg', count: 2 },
      { label: 'Laat', count: 1 },
    ]);
  });

  it('laat een vraag zonder antwoorden weg in plaats van een lege grafiek te tonen', () => {
    const fields = [
      field({ id: 'f1', code: 'shift', type: 'SINGLE_CHOICE', options: [{ code: 'a', labelNl: 'A', labelEn: null }] }),
    ];
    expect(answerSummary(fields, [entry()], 'nl')).toEqual([]);
  });
});
