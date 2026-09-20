import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import { canSeeTripDetails } from '../lib/session';
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
