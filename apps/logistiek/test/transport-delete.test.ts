import { describe, expect, it } from 'vitest';
import { canDeleteTransport, transportDeleteDescription } from '@/lib/uitleen';

type Leg = Parameters<typeof transportDeleteDescription>[0][number];

const now = new Date('2026-09-13T12:00:00Z');

/** Een goedgekeurde rit uit een aanvraag, volgende week. */
function leg(overrides: Partial<Leg> = {}): Leg {
  return {
    plannedByTeam: false,
    status: 'APPROVED',
    endAt: new Date('2026-09-20T18:00:00Z'),
    user: { name: 'Sam Peeters' },
    driver: null,
    ...overrides,
  };
}

describe('canDeleteTransport', () => {
  it('weigert enkel een rit waar een betaling aan hangt', () => {
    expect(canDeleteTransport({ payments: [] })).toBe(true);
    expect(canDeleteTransport({ payments: [{ id: 'betaling' }] })).toBe(false);
  });
});

describe('transportDeleteDescription', () => {
  it('noemt de aanvrager van een rit die nog moet komen, met afwijzen als uitweg', () => {
    const text = transportDeleteDescription([leg({ status: 'REQUESTED' })], now);
    expect(text).toContain('Sam Peeters');
    expect(text).toContain('wijs de aanvraag dan af');
    expect(text).toContain('het voertuig komt op dat moment weer vrij');
  });

  it('zegt bij een goedgekeurde rit dat de goedkeuring eerst terug moet', () => {
    expect(transportDeleteDescription([leg()], now)).toContain('draai dan de goedkeuring terug');
  });

  it('noemt de chauffeur enkel bij een goedgekeurde rit', () => {
    const driver = { name: 'Robin Claes' };
    expect(transportDeleteDescription([leg({ driver })], now)).toContain('Robin Claes');
    expect(transportDeleteDescription([leg({ driver, status: 'REQUESTED' })], now)).not.toContain(
      'Robin Claes'
    );
  });

  it('waarschuwt niet voor een aanvrager wanneer het team de rit zelf tekende', () => {
    const text = transportDeleteDescription([leg({ plannedByTeam: true })], now);
    expect(text).not.toContain('Sam Peeters');
    expect(text).not.toContain('aanvraag');
  });

  it('laat de waarschuwingen weg bij een gereden rit', () => {
    const text = transportDeleteDescription(
      [
        leg({
          status: 'COMPLETED',
          endAt: new Date('2026-09-01T18:00:00Z'),
          driver: { name: 'Robin Claes' },
        }),
      ],
      now
    );
    expect(text).not.toContain('Sam Peeters');
    expect(text).not.toContain('Robin Claes');
    expect(text).not.toContain('voertuig');
    expect(text).toContain('historiek');
  });

  it('zegt hoeveel ritten er samen weggaan', () => {
    const text = transportDeleteDescription(
      [leg({ plannedByTeam: true }), leg({ plannedByTeam: true })],
      now
    );
    expect(text).toContain('2 ritten');
  });
});
