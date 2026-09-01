import { describe, expect, it } from 'vitest';
import { placeForWeekRow, weekRows } from '../lib/month-lanes';
import { calendarRange, isInMonth, parseCalendarView, shiftAnchor } from '../lib/calendar-range';

/** Date-only, zoals `todayDateOnly` ze maakt: UTC-middernacht van een Belgische dag. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Een rij van zeven dagen vanaf deze maandag. */
const row = (monday: string) =>
  Array.from({ length: 7 }, (_, index) => day(monday)).map(
    (d, index) => new Date(d.getTime() + index * 24 * 60 * 60 * 1000)
  );

describe('placeForWeekRow', () => {
  const week = row('2026-08-31'); // ma 31/8 t/m zo 6/9

  it('legt een rit van één dag op één kolom', () => {
    const [bar] = placeForWeekRow(
      [{ startAt: '2026-09-02T09:00:00.000Z', endAt: '2026-09-02T12:00:00.000Z' }],
      week
    );
    expect(bar.col).toBe(2); // woensdag
    expect(bar.span).toBe(1);
    expect(bar.continuesBefore).toBe(false);
    expect(bar.continuesAfter).toBe(false);
  });

  it('maakt van een rit over drie dagen één balk', () => {
    const [bar] = placeForWeekRow(
      [{ startAt: '2026-09-04T14:00:00.000Z', endAt: '2026-09-06T18:00:00.000Z' }],
      week
    );
    expect(bar.col).toBe(4); // vrijdag
    expect(bar.span).toBe(3); // t/m zondag
  });

  it('telt een rit die op middernacht eindigt niet mee als extra dag', () => {
    // 3 september 00:00 Belgische tijd = 2 september 22:00 UTC. Die rit hoort
    // volledig op woensdag; een extra kolom op donderdag zou beweren dat het
    // voertuig die dag ook bezet is.
    const [bar] = placeForWeekRow(
      [{ startAt: '2026-09-02T06:00:00.000Z', endAt: '2026-09-02T22:00:00.000Z' }],
      week
    );
    expect(bar.col).toBe(2);
    expect(bar.span).toBe(1);
  });

  it('knipt een rit die voor de rij begon en erna doorloopt', () => {
    const [bar] = placeForWeekRow(
      [{ startAt: '2026-08-29T10:00:00.000Z', endAt: '2026-09-09T10:00:00.000Z' }],
      week
    );
    expect(bar.col).toBe(0);
    expect(bar.span).toBe(7);
    expect(bar.continuesBefore).toBe(true);
    expect(bar.continuesAfter).toBe(true);
  });

  it('laat ritten met alleen deze rij buiten beschouwing', () => {
    expect(
      placeForWeekRow(
        [{ startAt: '2026-09-14T10:00:00.000Z', endAt: '2026-09-14T12:00:00.000Z' }],
        week
      )
    ).toHaveLength(0);
  });

  it('zet overlappende balken onder elkaar, de langste bovenaan', () => {
    const bars = placeForWeekRow(
      [
        { id: 'kort', startAt: '2026-09-01T09:00:00.000Z', endAt: '2026-09-01T11:00:00.000Z' },
        { id: 'lang', startAt: '2026-09-01T08:00:00.000Z', endAt: '2026-09-03T18:00:00.000Z' },
      ],
      week
    );
    const byId = Object.fromEntries(bars.map((bar) => [bar.id, bar]));
    expect(byId.lang.lane).toBe(0);
    expect(byId.kort.lane).toBe(1);
  });

  it('hergebruikt een baan zodra ze vrij is', () => {
    const bars = placeForWeekRow(
      [
        { id: 'ma', startAt: '2026-08-31T09:00:00.000Z', endAt: '2026-08-31T11:00:00.000Z' },
        { id: 'za', startAt: '2026-09-05T09:00:00.000Z', endAt: '2026-09-05T11:00:00.000Z' },
      ],
      week
    );
    expect(bars.every((bar) => bar.lane === 0)).toBe(true);
  });
});

describe('calendarRange', () => {
  it('geeft één dag in dagweergave', () => {
    const range = calendarRange('dag', day('2026-09-03'));
    expect(range.days).toHaveLength(1);
    expect(range.to.toISOString()).toBe('2026-09-04T00:00:00.000Z');
  });

  it('begint de week op maandag, ook wanneer je op zondag klikt', () => {
    const range = calendarRange('week', day('2026-09-06'));
    expect(range.days).toHaveLength(7);
    expect(range.from.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('geeft de maand als hele weken, maandag eerst', () => {
    const range = calendarRange('maand', day('2026-09-15'));
    expect(range.days.length % 7).toBe(0);
    // September 2026 begint op een dinsdag; het raster begint dus op 31 augustus.
    expect(range.from.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(range.days[range.days.length - 1].getUTCDay()).toBe(0); // zondag
    expect(weekRows(range.days).every((r) => r.length === 7)).toBe(true);
  });

  it('markeert dagen buiten de maand', () => {
    const anchor = day('2026-09-15');
    expect(isInMonth(day('2026-08-31'), anchor)).toBe(false);
    expect(isInMonth(day('2026-09-01'), anchor)).toBe(true);
  });
});

describe('shiftAnchor', () => {
  it('verspringt per kalendermaand en niet per vier weken', () => {
    // Vier weken zou na twaalf klikken in een andere maand uitkomen dan je
    // verwacht; dat is het verschil tussen "volgende maand" en "over 28 dagen".
    expect(shiftAnchor('maand', day('2026-01-31'), 1).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z'
    );
    expect(shiftAnchor('maand', day('2026-12-15'), 1).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z'
    );
  });

  it('verspringt per week vanaf de maandag', () => {
    expect(shiftAnchor('week', day('2026-09-03'), 1).toISOString()).toBe(
      '2026-09-07T00:00:00.000Z'
    );
    expect(shiftAnchor('week', day('2026-09-03'), -1).toISOString()).toBe(
      '2026-08-24T00:00:00.000Z'
    );
  });

  it('verspringt per dag in dagweergave', () => {
    expect(shiftAnchor('dag', day('2026-09-03'), -1).toISOString()).toBe(
      '2026-09-02T00:00:00.000Z'
    );
  });
});

describe('parseCalendarView', () => {
  it('valt terug op week', () => {
    expect(parseCalendarView(undefined)).toBe('week');
    expect(parseCalendarView('jaar')).toBe('week');
    expect(parseCalendarView('maand')).toBe('maand');
  });
});
