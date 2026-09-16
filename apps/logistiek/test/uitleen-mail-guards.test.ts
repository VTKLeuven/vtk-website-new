import { describe, expect, it } from 'vitest';
import { shouldNotifyReservation, shouldNotifyTransport } from '../lib/uitleen-mail';

describe('shouldNotifyTransport', () => {
  it('stuurt geen mail wanneer de rit door het team zelf is ingetekend (plannedByTeam)', () => {
    expect(
      shouldNotifyTransport(
        { plannedByTeam: true, userId: 'user-admin' },
        { actorId: 'user-other' }
      )
    ).toBe(false);

    expect(
      shouldNotifyTransport(
        { plannedByTeam: true, userId: 'user-admin' }
      )
    ).toBe(false);
  });

  it('stuurt geen mail wanneer de bewerker dezelfde is als de aanvrager (actorId === userId)', () => {
    expect(
      shouldNotifyTransport(
        { plannedByTeam: false, userId: 'user-member' },
        { actorId: 'user-member' }
      )
    ).toBe(false);
  });

  it('stuurt wel een mail naar de aanvrager wanneer iemand anders zijn aangevraagde rit bewerkt', () => {
    expect(
      shouldNotifyTransport(
        { plannedByTeam: false, userId: 'user-member' },
        { actorId: 'user-admin' }
      )
    ).toBe(true);
  });

  it('stuurt wel een mail wanneer er geen actorId is meegegeven bij een gewone aanvraag', () => {
    expect(
      shouldNotifyTransport(
        { plannedByTeam: false, userId: 'user-member' }
      )
    ).toBe(true);
  });
});

describe('shouldNotifyReservation', () => {
  it('stuurt geen mail wanneer de bewerker dezelfde is als de aanvrager', () => {
    expect(
      shouldNotifyReservation(
        { userId: 'user-member' },
        { actorId: 'user-member' }
      )
    ).toBe(false);
  });

  it('stuurt wel een mail wanneer iemand anders de aanvraag bewerkt', () => {
    expect(
      shouldNotifyReservation(
        { userId: 'user-member' },
        { actorId: 'user-admin' }
      )
    ).toBe(true);
  });

  it('stuurt wel een mail wanneer er geen actorId is meegegeven', () => {
    expect(
      shouldNotifyReservation(
        { userId: 'user-member' }
      )
    ).toBe(true);
  });
});
