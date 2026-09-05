import { describe, expect, it } from 'vitest';
import {
  cellsForDay,
  clipOutsideDay,
  hoursToRanges,
  mergeRanges,
  rangeToHours,
  subtractRange,
} from '../lib/availability-day';

const at = (iso: string) => new Date(iso);

/** Een venster van de soort "beschikbaar"; de gewone soort in deze tests. */
const ja = (from: string, to: string) =>
  ({ startAt: at(from), endAt: at(to), kind: 'JA' }) as const;

describe('mergeRanges', () => {
  it('plakt aansluitende bereiken aan elkaar', () => {
    // Twee vensters die op elkaar aansluiten zijn één blok. Als twee losse
    // banden zien ze eruit als een gaatje dat er niet is.
    const out = mergeRanges([
      ja('2026-09-02T12:00Z', '2026-09-02T14:00Z'),
      ja('2026-09-02T14:00Z', '2026-09-02T18:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].endAt.toISOString()).toBe(at('2026-09-02T18:00Z').toISOString());
  });

  it('laat een echt gat staan', () => {
    const out = mergeRanges([
      ja('2026-09-02T09:00Z', '2026-09-02T11:00Z'),
      ja('2026-09-02T13:00Z', '2026-09-02T15:00Z'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('gooit lege en omgekeerde bereiken weg', () => {
    expect(mergeRanges([ja('2026-09-02T12:00Z', '2026-09-02T12:00Z')])).toEqual([]);
    expect(mergeRanges([ja('2026-09-02T14:00Z', '2026-09-02T12:00Z')])).toEqual([]);
  });

  it('plakt twee soorten niet aan elkaar', () => {
    // "Beschikbaar tot 14:00, liever niet tot 18:00" zijn twee antwoorden.
    // Samengevoegd verdwijnt precies het onderscheid waarvoor de soorten
    // bestaan.
    const out = mergeRanges([
      { startAt: at('2026-09-02T12:00Z'), endAt: at('2026-09-02T14:00Z'), kind: 'JA' },
      { startAt: at('2026-09-02T14:00Z'), endAt: at('2026-09-02T18:00Z'), kind: 'LIEVER_NIET' },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((range) => range.kind)).toEqual(['JA', 'LIEVER_NIET']);
  });
});

describe('subtractRange', () => {
  it('knipt het midden uit en houdt twee uiteinden over', () => {
    // Zo maakt een nieuw venster plaats bij de andere soorten: hetzelfde uur mag
    // niet twee dingen tegelijk zeggen.
    const out = subtractRange(
      ja('2026-09-02T08:00Z', '2026-09-02T18:00Z'),
      at('2026-09-02T12:00Z'),
      at('2026-09-02T14:00Z')
    );
    expect(out).toHaveLength(2);
    expect(out[0].endAt.toISOString()).toBe(at('2026-09-02T12:00Z').toISOString());
    expect(out[1].startAt.toISOString()).toBe(at('2026-09-02T14:00Z').toISOString());
    expect(out[0].kind).toBe('JA');
  });

  it('laat niets over wanneer het venster helemaal weggeknipt wordt', () => {
    expect(
      subtractRange(
        ja('2026-09-02T12:00Z', '2026-09-02T13:00Z'),
        at('2026-09-02T08:00Z'),
        at('2026-09-02T18:00Z')
      )
    ).toEqual([]);
  });
});

describe('clipOutsideDay', () => {
  const dayStart = at('2026-09-05T00:00Z');
  const dayEnd = at('2026-09-06T00:00Z');

  it('houdt de stukken van de dagen ernaast over', () => {
    // Dit is de hele reden dat deze functie bestaat: één dag herschrijven mag de
    // dagen ernaast niet stil wegvegen.
    const out = clipOutsideDay(ja('2026-09-04T20:00Z', '2026-09-06T08:00Z'), dayStart, dayEnd);
    expect(out).toHaveLength(2);
    expect(out[0].endAt.toISOString()).toBe(dayStart.toISOString());
    expect(out[1].startAt.toISOString()).toBe(dayEnd.toISOString());
  });

  it('geeft niets terug voor een venster dat helemaal binnen de dag valt', () => {
    expect(clipOutsideDay(ja('2026-09-05T09:00Z', '2026-09-05T17:00Z'), dayStart, dayEnd)).toEqual(
      []
    );
  });

  it('laat een venster buiten de dag helemaal staan', () => {
    const out = clipOutsideDay(ja('2026-09-07T09:00Z', '2026-09-07T17:00Z'), dayStart, dayEnd);
    expect(out).toHaveLength(1);
    expect(out[0].startAt.toISOString()).toBe(at('2026-09-07T09:00Z').toISOString());
  });
});

describe('hoursToRanges', () => {
  const dayStart = at('2026-09-02T00:00Z');

  /** Uurvakjes van dezelfde soort, kort opgeschreven. */
  const cells = (kind: 'JA' | 'LIEVER_NIET' | 'NOOD', ...hours: number[]) =>
    hours.map((hour) => ({ hour, kind }));

  it('maakt van opeenvolgende uren één venster', () => {
    const out = hoursToRanges(cells('JA', 9, 10, 11, 12), dayStart);
    expect(out).toHaveLength(1);
    expect(out[0].startAt.toISOString()).toBe(at('2026-09-02T09:00Z').toISOString());
    expect(out[0].endAt.toISOString()).toBe(at('2026-09-02T13:00Z').toISOString());
  });

  it('houdt losse blokken uit elkaar', () => {
    expect(hoursToRanges(cells('JA', 9, 10, 14, 15), dayStart)).toHaveLength(2);
  });

  it('trekt zich niets aan van de volgorde of van dubbels', () => {
    expect(hoursToRanges(cells('JA', 11, 9, 10, 9), dayStart)).toHaveLength(1);
  });

  it('negeert uren buiten de dag', () => {
    expect(hoursToRanges(cells('JA', -1, 24, 99), dayStart)).toEqual([]);
  });

  it('begint een nieuw venster zodra de soort omslaat', () => {
    const out = hoursToRanges(
      [...cells('JA', 9, 10), ...cells('LIEVER_NIET', 11, 12)],
      dayStart
    );
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('JA');
    expect(out[0].endAt.toISOString()).toBe(at('2026-09-02T11:00Z').toISOString());
    expect(out[1].kind).toBe('LIEVER_NIET');
  });
});

describe('cellsForDay', () => {
  const dayStart = at('2026-09-02T00:00Z');
  const dayEnd = at('2026-09-03T00:00Z');

  it('geeft per uur de soort van het venster', () => {
    const out = cellsForDay(
      [
        { startAt: at('2026-09-02T09:00Z'), endAt: at('2026-09-02T11:00Z'), kind: 'JA' },
        { startAt: at('2026-09-02T11:00Z'), endAt: at('2026-09-02T12:00Z'), kind: 'NOOD' },
      ],
      dayStart,
      dayEnd
    );
    expect(out.get(9)).toBe('JA');
    expect(out.get(10)).toBe('JA');
    expect(out.get(11)).toBe('NOOD');
    expect(out.has(12)).toBe(false);
  });

  it('laat het gulste antwoord winnen bij oude, overlappende vensters', () => {
    // Kan enkel bij rijen van voor deze kolom bestond. Wie ooit "ja" zei voor
    // dat uur, is niet minder beschikbaar geworden door een breed "in
    // noodgeval" eroverheen.
    const out = cellsForDay(
      [
        { startAt: at('2026-09-02T08:00Z'), endAt: at('2026-09-02T18:00Z'), kind: 'NOOD' },
        { startAt: at('2026-09-02T09:00Z'), endAt: at('2026-09-02T10:00Z'), kind: 'JA' },
      ],
      dayStart,
      dayEnd
    );
    expect(out.get(9)).toBe('JA');
    expect(out.get(11)).toBe('NOOD');
  });
});

describe('rangeToHours', () => {
  const dayStart = at('2026-09-02T00:00Z');
  const dayEnd = at('2026-09-03T00:00Z');

  it('kleurt elk uur dat het venster raakt', () => {
    // 09:15 tot 12:00 raakt de uren 9, 10 en 11. Uur 12 niet: het venster is
    // dan al gedaan, en een half gekleurd vakje bestaat niet.
    expect(
      rangeToHours(
        { startAt: at('2026-09-02T09:15Z'), endAt: at('2026-09-02T12:00Z') },
        dayStart,
        dayEnd
      )
    ).toEqual([9, 10, 11]);
  });

  it('knipt op de dagranden', () => {
    const hours = rangeToHours(
      { startAt: at('2026-09-01T20:00Z'), endAt: at('2026-09-02T03:00Z') },
      dayStart,
      dayEnd
    );
    expect(hours).toEqual([0, 1, 2]);
  });

  it('geeft niets voor een venster dat deze dag niet raakt', () => {
    expect(
      rangeToHours(
        { startAt: at('2026-09-05T09:00Z'), endAt: at('2026-09-05T17:00Z') },
        dayStart,
        dayEnd
      )
    ).toEqual([]);
  });
});
