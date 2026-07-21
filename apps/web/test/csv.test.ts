import { describe, expect, it } from 'vitest';
import { createCsv, csvCell } from '@/lib/ticketing/csv';

describe('ticket CSV exports', () => {
  it('quotes commas, newlines and quotes', () => {
    expect(csvCell('Van, "Leuven"\nVTK')).toBe('"Van, ""Leuven""\nVTK"');
  });

  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', ' =HYPERLINK("x")', '\t=1'])(
    'neutralizes spreadsheet formula input %s',
    (value) => {
      expect(csvCell(value).replace(/^\"?/, '').startsWith("'")).toBe(true);
    }
  );

  it('serializes dates and emits an Excel-compatible UTF-8 BOM', () => {
    const csv = createCsv(['datum'], [[new Date('2026-07-12T10:00:00.000Z')]]);
    expect(csv.startsWith('\uFEFFdatum\r\n')).toBe(true);
    expect(csv).toContain('2026-07-12T10:00:00.000Z');
  });
});
