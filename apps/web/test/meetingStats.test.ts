import { describe, expect, it } from 'vitest';
import {
  OTHER,
  cumulativeCurve,
  curveIndex,
  UNMEASURED,
  meetingCurve,
  seriesKeys,
  sourceRows,
  yearOverview,
  type StatsMeeting,
  type StatsReservation,
} from '@/lib/meetingStats';

function reservation(at: string, source: string | null, overrides: Partial<StatsReservation> = {}): StatsReservation {
  return { userId: `u-${at}-${source}`, createdAt: new Date(at), source, sourceCampaign: null, ...overrides };
}

function meeting(overrides: Partial<StatsMeeting> = {}): StatsMeeting {
  return {
    id: 'm1',
    startsAt: new Date('2026-10-20T10:30:00Z'),
    opensAt: new Date('2026-10-13T08:00:00Z'),
    reservations: [],
    ...overrides,
  };
}

const values = (curve: { series: { key: string; values: number[] }[] }, key: string) =>
  curve.series.find((s) => s.key === key)?.values;

describe('meetingCurve', () => {
  it('loopt van het openen tot het bureau, per dag gestapeld per herkomst', () => {
    const curve = meetingCurve(
      meeting({
        reservations: [
          reservation('2026-10-13T09:00:00Z', 'mail'),
          reservation('2026-10-13T12:00:00Z', 'mail'),
          reservation('2026-10-15T09:00:00Z', 'instagram'),
        ],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    expect(curve.days[0]).toBe('2026-10-13');
    expect(curve.days.at(-1)).toBe('2026-10-20');
    expect(curve.days).toHaveLength(8);
    expect(values(curve, 'mail')?.slice(0, 3)).toEqual([2, 0, 0]);
    expect(values(curve, 'instagram')?.slice(0, 3)).toEqual([0, 0, 1]);
  });

  it('stopt vandaag bij een bureau dat nog moet komen', () => {
    const curve = meetingCurve(
      meeting({ reservations: [reservation('2026-10-13T09:00:00Z', 'mail')] }),
      new Date('2026-10-16T12:00:00Z')
    );
    expect(curve.days.at(-1)).toBe('2026-10-16');
  });

  it('begint zonder opensAt bij de eerste inschrijving', () => {
    const curve = meetingCurve(
      meeting({ opensAt: null, reservations: [reservation('2026-10-17T09:00:00Z', 'mail')] }),
      new Date('2026-11-01T00:00:00Z')
    );
    expect(curve.days[0]).toBe('2026-10-17');
  });

  it('telt op de Brusselse klok, ook rond de overgang naar wintertijd', () => {
    // 25 oktober 2026: om 03:00 zomertijd wordt het 02:00. 23:30 UTC op de
    // 24e is 01:30 op de 25e in Brussel (nog zomertijd, UTC+2).
    const curve = meetingCurve(
      meeting({
        startsAt: new Date('2026-10-27T10:30:00Z'),
        opensAt: new Date('2026-10-24T08:00:00Z'),
        reservations: [
          reservation('2026-10-24T22:30:00Z', 'mail'),
          // 23:30 UTC op de 25e is 00:30 op de 26e (wintertijd, UTC+1).
          reservation('2026-10-25T23:30:00Z', 'mail'),
        ],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    expect(curve.days.slice(0, 3)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(values(curve, 'mail')?.slice(0, 3)).toEqual([0, 1, 1]);
  });

  it('zet alles buiten de grootste drie kanalen onder Andere', () => {
    const curve = meetingCurve(
      meeting({
        reservations: [
          ...['mail', 'mail', 'mail', 'instagram', 'instagram', 'whatsapp', 'qr'].map((source, i) =>
            reservation(`2026-10-14T0${i}:00:00Z`, source)
          ),
        ],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    // whatsapp en qr hebben er elk één: gelijke aantallen op naam.
    expect(curve.series.map((s) => s.key)).toEqual(['mail', 'instagram', 'qr', OTHER]);
    expect(values(curve, OTHER)?.[1]).toBe(1);
  });

  it('houdt niet gemeten apart, ook naast drie kanalen', () => {
    const curve = meetingCurve(
      meeting({
        reservations: [
          ...['mail', 'mail', 'instagram', 'whatsapp', 'qr', null, null, null].map((source, i) =>
            reservation(`2026-10-14T0${i}:00:00Z`, source)
          ),
        ],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    expect(curve.series.map((s) => s.key)).toEqual(['mail', 'instagram', 'qr', OTHER, UNMEASURED]);
    expect(values(curve, UNMEASURED)?.[1]).toBe(3);
    expect(values(curve, OTHER)?.[1]).toBe(1);
  });

  it('is leeg zonder inschrijvingen', () => {
    expect(meetingCurve(meeting())).toEqual({ days: [], series: [] });
  });
});

describe('sourceRows', () => {
  it('geeft aantal, aandeel en eerste inschrijving per kanaal, niet gemeten achteraan', () => {
    const rows = sourceRows([
      reservation('2026-10-13T09:00:00Z', null),
      reservation('2026-10-13T09:00:00Z', null),
      reservation('2026-10-13T09:00:00Z', null),
      reservation('2026-10-14T09:00:00Z', 'mail', { sourceCampaign: 'herinnering' }),
      reservation('2026-10-13T10:00:00Z', 'mail'),
    ]);
    expect(rows.map((row) => row.key)).toEqual(['mail', UNMEASURED]);
    expect(rows[0]).toMatchObject({ count: 2, share: 0.4, firstAt: new Date('2026-10-13T10:00:00Z') });
    expect(rows[0].campaigns).toEqual([
      { key: 'herinnering', count: 1, share: 0.2, firstAt: new Date('2026-10-14T09:00:00Z') },
    ]);
    expect(rows[1]).toMatchObject({ count: 3, share: 0.6 });
  });

  it('houdt direct en niet gemeten uit elkaar', () => {
    const rows = sourceRows([reservation('2026-10-13T09:00:00Z', 'direct'), reservation('2026-10-13T09:00:00Z', null)]);
    expect(rows.map((row) => row.key)).toEqual(['direct', UNMEASURED]);
  });
});

describe('meetingCurve met de reeksen en momenten van het jaar', () => {
  it('begint op de dag van een reclamemoment van voor het openen, zoals de lijn', () => {
    const curve = meetingCurve(
      meeting({ reservations: [reservation('2026-10-14T09:00:00Z', 'mail')] }),
      new Date('2026-10-15T12:00:00Z'),
      { promotions: [new Date('2026-10-11T18:00:00Z')] }
    );
    expect(curve.days[0]).toBe('2026-10-11');
  });

  it('een moment na het einde rekt de as niet op', () => {
    const curve = meetingCurve(
      meeting({ reservations: [reservation('2026-10-14T09:00:00Z', 'mail')] }),
      new Date('2026-10-15T12:00:00Z'),
      { promotions: [new Date('2026-10-30T18:00:00Z')] }
    );
    expect(curve.days.at(-1)).toBe('2026-10-15');
  });

  it('legt een kanaal in dezelfde reeks als het jaar, ook als het bij dit bureau groot is', () => {
    // Over het jaar valt discord onder Andere; bij dit ene bureau is het het grootste.
    const year = [
      ...['mail', 'mail', 'mail', 'instagram', 'instagram', 'whatsapp', 'whatsapp'].map((source, i) =>
        reservation(`2026-10-0${i + 1}T09:00:00Z`, source)
      ),
      reservation('2026-10-14T09:00:00Z', 'discord'),
    ];
    const keys = seriesKeys(year);
    expect(keys).toEqual(['mail', 'instagram', 'whatsapp', OTHER]);
    const curve = meetingCurve(
      meeting({ reservations: [reservation('2026-10-14T09:00:00Z', 'discord')] }),
      new Date('2026-10-15T12:00:00Z'),
      { keys }
    );
    expect(curve.series.map((s) => s.key)).toEqual(keys);
    expect(values(curve, OTHER)?.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('yearOverview', () => {
  const bureau = (id: string, startsAt: string, users: string[], source = 'mail'): StatsMeeting =>
    meeting({
      id,
      startsAt: new Date(startsAt),
      reservations: users.map((userId) => reservation(startsAt, source, { userId })),
    });

  it('telt terugkerend tegenover eerdere bureaus van de lijst, ongeacht de volgorde', () => {
    const year = yearOverview([
      bureau('b2', '2026-10-20T10:30:00Z', ['anna', 'bert', 'carl'], 'instagram'),
      bureau('b1', '2026-10-06T10:30:00Z', ['anna', 'bert']),
    ]);
    expect(year.meetings).toEqual([
      { id: 'b1', day: '2026-10-06', total: 2, newcomers: 2, returning: 0 },
      { id: 'b2', day: '2026-10-20', total: 3, newcomers: 1, returning: 2 },
    ]);
    expect(year.series.find((s) => s.key === 'mail')?.values).toEqual([2, 0]);
    expect(year.series.find((s) => s.key === 'instagram')?.values).toEqual([0, 3]);
  });
});

describe('cumulativeCurve', () => {
  it('telt per uur op, van het openen tot nu', () => {
    const curve = cumulativeCurve(
      meeting({
        opensAt: new Date('2026-10-13T08:00:00Z'),
        reservations: [
          reservation('2026-10-13T09:15:00Z', 'mail'),
          reservation('2026-10-13T09:45:00Z', 'mail'),
          reservation('2026-10-13T11:00:00Z', 'instagram'),
        ],
      }),
      new Date('2026-10-13T12:30:00Z')
    );
    expect(curve.stepHours).toBe(1);
    expect(curve.keys[0]).toBe('2026-10-13T08:00:00.000Z');
    expect(curve.keys.at(-1)).toBe('2026-10-13T12:00:00.000Z');
    // 08u: 0, 09u: 2, 10u: 2, 11u: 3 (11:00 telt in het uur dat dan begint), 12u: 3
    expect(curve.values).toEqual([0, 2, 2, 3, 3]);
  });

  it('geeft elk uur een eigen sleutel, ook als 02:00 in Brussel twee keer voorkomt', () => {
    const curve = cumulativeCurve(
      meeting({
        opensAt: new Date('2026-10-24T22:00:00Z'),
        startsAt: new Date('2026-10-25T03:00:00Z'),
        reservations: [reservation('2026-10-25T01:30:00Z', 'mail')],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    expect(new Set(curve.keys).size).toBe(curve.keys.length);
    expect(curve.keys).toHaveLength(6);
  });

  it('neemt grotere stappen wanneer het bureau weken op voorhand opent', () => {
    const opens = new Date('2026-10-01T00:00:00Z');
    const twoWeeks = cumulativeCurve(
      meeting({
        opensAt: opens,
        startsAt: new Date('2026-10-15T00:00:00Z'),
        reservations: [reservation('2026-10-02T10:00:00Z', 'mail')],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    const fourWeeks = cumulativeCurve(
      meeting({
        opensAt: opens,
        startsAt: new Date('2026-10-29T00:00:00Z'),
        reservations: [reservation('2026-10-02T10:00:00Z', 'mail')],
      }),
      new Date('2026-11-01T00:00:00Z')
    );
    expect(twoWeeks.stepHours).toBe(3);
    expect(fourWeeks.stepHours).toBe(6);
    expect(twoWeeks.values.at(-1)).toBe(1);
  });

  it('is leeg zonder inschrijvingen', () => {
    expect(cumulativeCurve(meeting()).keys).toEqual([]);
  });
});

describe('curveIndex', () => {
  const base = meeting({
    opensAt: new Date('2026-10-13T08:00:00Z'),
    reservations: [reservation('2026-10-13T09:15:00Z', 'mail')],
  });
  const now = new Date('2026-10-13T12:30:00Z');

  it('zet een moment in het uur waarin het viel', () => {
    const curve = cumulativeCurve(base, now);
    expect(curveIndex(curve, new Date('2026-10-13T09:59:00Z'))).toBe(1);
    expect(curveIndex(curve, new Date('2026-10-13T12:10:00Z'))).toBe(4);
  });

  it('rekt de as naar achter voor een aankondiging van voor het openen', () => {
    const announced = new Date('2026-10-13T05:30:00Z');
    const curve = cumulativeCurve(base, now, [announced]);
    expect(curve.keys[0]).toBe('2026-10-13T05:00:00.000Z');
    expect(curveIndex(curve, announced)).toBe(0);
  });

  it('toont geen moment na nu', () => {
    const later = new Date('2026-10-14T09:00:00Z');
    const curve = cumulativeCurve(base, now, [later]);
    expect(curve.keys.at(-1)).toBe('2026-10-13T12:00:00.000Z');
    expect(curveIndex(curve, later)).toBeNull();
  });
});
