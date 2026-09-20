import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import { canSeeTripDetails } from '../lib/session';
import { canReadTripNote, onTripForNotes, ownsTransportBooking } from '../lib/uitleen';

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

  /**
   * F4.8a: Logistiek geeft een rit door aan een post, en dan zet die post er
   * zelf de chauffeur en de bijrijders op. Zonder deze tak kon dat enkel bij een
   * rit die je eigen post ook aangevraagd had, terwijl ze wel in haar lijst
   * staat.
   */
  it('laat de post erbij waaraan de rit doorgegeven is', () => {
    expect(
      ownsTransportBooking(
        {
          userId: 'u2',
          requesterType: 'WERKGROEP',
          groupId: null,
          assignedGroupId: 'post-sport',
        },
        viewer
      )
    ).toBe(true);
  });

  it('laat de post van iemand anders er niet bij via de doorgeeftak', () => {
    expect(
      ownsTransportBooking(
        {
          userId: 'u2',
          requesterType: 'INTERN',
          groupId: 'post-cultuur',
          assignedGroupId: 'post-cultuur',
        },
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

describe('canSeeTripDetails', () => {
  const baseUser = {
    id: 'u1',
    email: 'test@vtk.be',
    name: 'Test Lid',
    avatarKey: null,
    locale: 'NL' as const,
    isSuperAdmin: false,
    onboarded: true,
    studyConfirmedYear: 2026,
    isStudent: true,
    googleLinked: true,
    googleLinkDeferredAt: null,
  };

  const makeSession = (
    groups: Array<{ type: 'PRAESIDIUM' | 'WERKGROEP'; code: string }>,
    permissions: string[] = [],
    isSuperAdmin = false
  ): SessionPayload => ({
    token: 'tok',
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: { ...baseUser, isSuperAdmin },
    groups: groups.map((g) => ({
      id: g.code,
      code: g.code,
      slug: g.code.toLowerCase(),
      nameNl: g.code,
      nameEn: g.code,
      role: 'MEMBER' as const,
      type: g.type,
    })),
    permissions,
    roleIds: [],
  });

  it('geeft een gewoon lid zonder groep geen toegang tot ritdetails', () => {
    expect(canSeeTripDetails(makeSession([]))).toBe(false);
  });

  it('geeft een praesidiumlid toegang tot ritdetails', () => {
    expect(
      canSeeTripDetails(makeSession([{ type: 'PRAESIDIUM', code: 'SPORT' }]))
    ).toBe(true);
  });

  it('geeft een werkgroep- of jaarwerkingslid toegang tot ritdetails', () => {
    expect(
      canSeeTripDetails(makeSession([{ type: 'WERKGROEP', code: 'REVUE' }]))
    ).toBe(true);
  });

  it('geeft iemand met logistiek.helpers toegang tot ritdetails', () => {
    expect(canSeeTripDetails(makeSession([], ['logistiek.helpers']))).toBe(true);
  });

  it('geeft wie logistiek.manage heeft toegang tot ritdetails', () => {
    expect(canSeeTripDetails(makeSession([], ['logistiek.manage']))).toBe(true);
  });

  it('geeft een superadmin toegang tot ritdetails', () => {
    expect(canSeeTripDetails(makeSession([], [], true))).toBe(true);
  });
});

/**
 * De eigen nota's bij een rit (F4.20).
 *
 * Twee regels, en ze hangen samen: `onTripForNotes` zegt wie er bij de rit
 * hoort, `canReadTripNote` wat dat per zichtbaarheid betekent. De query in
 * lib/uitleen-server.ts filtert met dezelfde regel, zodat andermans privénota
 * niet eens uit de databank komt.
 */
describe('onTripForNotes', () => {
  const rit = {
    userId: 'aanvrager',
    requesterType: 'INTERN' as const,
    groupId: 'post-sport',
    assignedGroupId: null,
    driverId: 'chauffeur',
  };

  it('telt de toegewezen chauffeur mee, ook zonder post', () => {
    // Het verschil met `ownsTransportBooking`: die gaat over wie de gegevens van
    // de rit mag wijzigen, deze over wie erbij hoort. De chauffeur rijdt hem.
    expect(onTripForNotes(rit, { userId: 'chauffeur', groupIds: [] })).toBe(true);
    expect(ownsTransportBooking(rit, { userId: 'chauffeur', groupIds: [] })).toBe(false);
  });

  it('telt de aanvrager en zijn post mee', () => {
    expect(onTripForNotes(rit, { userId: 'aanvrager', groupIds: [] })).toBe(true);
    expect(onTripForNotes(rit, { userId: 'iemand', groupIds: ['post-sport'] })).toBe(true);
  });

  it('laat een buitenstaander erbuiten', () => {
    expect(onTripForNotes(rit, { userId: 'iemand', groupIds: ['post-feest'] })).toBe(false);
  });
});

describe('canReadTripNote', () => {
  const ik = { userId: 'ik', onTrip: true, logistiek: false };
  const collega = { userId: 'collega', onTrip: true, logistiek: false };
  const logi = { userId: 'logi', onTrip: false, logistiek: true };
  const vreemde = { userId: 'vreemde', onTrip: false, logistiek: false };

  it('laat je je eigen nota altijd lezen', () => {
    for (const visibility of ['PRIVE', 'POST', 'POST_EN_LOGISTIEK'] as const) {
      expect(canReadTripNote({ authorId: 'ik', visibility }, ik)).toBe(true);
    }
  });

  it('houdt een privénota privé, ook voor Logistiek', () => {
    // De hele belofte van dat vakje. Zonder deze regel is het een nota waarvan
    // je dénkt dat niemand ze leest, en dat is erger dan geen nota.
    const note = { authorId: 'ik', visibility: 'PRIVE' as const };
    expect(canReadTripNote(note, collega)).toBe(false);
    expect(canReadTripNote(note, logi)).toBe(false);
  });

  it('geeft een postnota aan wie de rit ziet, en niet aan Logistiek erbuiten', () => {
    const note = { authorId: 'ik', visibility: 'POST' as const };
    expect(canReadTripNote(note, collega)).toBe(true);
    expect(canReadTripNote(note, logi)).toBe(false);
    expect(canReadTripNote(note, vreemde)).toBe(false);
  });

  it('geeft de gedeelde nota aan allebei', () => {
    const note = { authorId: 'ik', visibility: 'POST_EN_LOGISTIEK' as const };
    expect(canReadTripNote(note, collega)).toBe(true);
    expect(canReadTripNote(note, logi)).toBe(true);
    expect(canReadTripNote(note, vreemde)).toBe(false);
  });
});
