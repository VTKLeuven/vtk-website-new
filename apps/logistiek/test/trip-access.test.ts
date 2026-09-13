import { describe, expect, it } from 'vitest';
import { ownsTransportBooking } from '../lib/uitleen';

/**
 * Wie mag de bijrijders van een rit bijwerken vanaf het bezettingsoverzicht?
 *
 * Deze regel staat twee keer: hier om de knop te tekenen, en in
 * `canEditHelpers` (app/actions/uitleen.ts) om de schrijfactie te bewaken. Ze
 * moeten hetzelfde zeggen, en `vanBookingForMember` is het origineel.
 */
describe('ownsTransportBooking', () => {
  const viewer = { userId: 'u1', groupIds: ['post-sport', 'wg-revue'] };

  it('herkent je eigen rit, ook zonder post', () => {
    expect(
      ownsTransportBooking(
        { userId: 'u1', requesterType: 'EXTERN', groupId: null },
        { userId: 'u1', groupIds: [] }
      )
    ).toBe(true);
  });

  it('laat een collega van dezelfde post erbij', () => {
    // Dit is de hele reden dat bijrijders na het aanvragen nog te wijzigen zijn:
    // wie meerijdt is pas de dag voordien bekend, vaak bij iemand anders.
    expect(
      ownsTransportBooking(
        { userId: 'u2', requesterType: 'INTERN', groupId: 'post-sport' },
        viewer
      )
    ).toBe(true);
  });

  it('houdt de rit van een andere post buiten', () => {
    expect(
      ownsTransportBooking(
        { userId: 'u2', requesterType: 'INTERN', groupId: 'post-cultuur' },
        viewer
      )
    ).toBe(false);
  });

  it('rekent een werkgroepaanvraag niet tot de post', () => {
    // Zoals `vanBookingForMember`: enkel INTERN hangt aan de groep. Een
    // werkgroeprit blijft dus van wie ze indiende.
    expect(
      ownsTransportBooking(
        { userId: 'u2', requesterType: 'WERKGROEP', groupId: 'wg-revue' },
        viewer
      )
    ).toBe(false);
  });
});
