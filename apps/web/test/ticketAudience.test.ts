import { describe, expect, it } from 'vitest';
import {
  NO_TICKET_PROFILE,
  ticketAudienceFrom,
  ticketAudiencesForProfile,
  ticketTypeIsHidden,
  ticketTypeMemberPrice,
  ticketTypeRequiresLogin,
} from '@/lib/ticketing/audience';

describe('ticket audience', () => {
  it('falls back to the widest audience for anything it does not recognise', () => {
    expect(ticketAudienceFrom('MEMBERS')).toBe('MEMBERS');
    expect(ticketAudienceFrom('HONORARY')).toBe('HONORARY');
    expect(ticketAudienceFrom('PUBLIC')).toBe('PUBLIC');
    expect(ticketAudienceFrom('members')).toBe('PUBLIC');
    expect(ticketAudienceFrom('')).toBe('PUBLIC');
    expect(ticketAudienceFrom(null)).toBe('PUBLIC');
    expect(ticketAudienceFrom(undefined)).toBe('PUBLIC');
  });

  it('lets a paid public ticket through without an account', () => {
    expect(ticketTypeRequiresLogin({ audience: 'PUBLIC', priceCents: 1_000 })).toBe(false);
  });

  it('asks for an account for a members-only ticket', () => {
    expect(ticketTypeRequiresLogin({ audience: 'MEMBERS', priceCents: 1_000 })).toBe(true);
  });

  it('asks for an account for a free ticket, whatever its audience', () => {
    expect(ticketTypeRequiresLogin({ audience: 'PUBLIC', priceCents: 0 })).toBe(true);
    expect(ticketTypeRequiresLogin({ audience: 'MEMBERS', priceCents: 0 })).toBe(true);
  });

  it('hides an honorary ticket from everyone but an honorary member', () => {
    const honorary = { honorary: true, audiences: [] };
    expect(ticketTypeIsHidden({ audience: 'HONORARY' }, NO_TICKET_PROFILE)).toBe(true);
    expect(ticketTypeIsHidden({ audience: 'HONORARY' }, honorary)).toBe(false);
    expect(ticketTypeIsHidden({ audience: 'MEMBERS' }, NO_TICKET_PROFILE)).toBe(false);
    expect(ticketTypeIsHidden({ audience: 'PUBLIC' }, NO_TICKET_PROFILE)).toBe(false);
  });

  it('hides a target-group ticket from everyone outside that group', () => {
    const firstYear = { honorary: false, audiences: ['FIRST_YEARS' as const] };
    expect(ticketTypeIsHidden({ audience: 'FIRST_YEARS' }, firstYear)).toBe(false);
    expect(ticketTypeIsHidden({ audience: 'LAST_YEARS' }, firstYear)).toBe(true);
    expect(ticketTypeIsHidden({ audience: 'ALUMNI' }, NO_TICKET_PROFILE)).toBe(true);
    // Erelid zijn opent geen doelgroepticket.
    expect(ticketTypeIsHidden({ audience: 'INTERNATIONALS' }, { honorary: true, audiences: [] })).toBe(true);
  });

  it('asks for an account for every audience except the public one', () => {
    for (const audience of ['FIRST_YEARS', 'LAST_YEARS', 'INTERNATIONALS', 'ALUMNI', 'HONORARY']) {
      expect(ticketTypeRequiresLogin({ audience, priceCents: 1_000 })).toBe(true);
    }
  });

  it('recognises the target groups and still falls back to public', () => {
    expect(ticketAudienceFrom('FIRST_YEARS')).toBe('FIRST_YEARS');
    expect(ticketAudienceFrom('ALUMNI')).toBe('ALUMNI');
    expect(ticketAudienceFrom('first_years')).toBe('PUBLIC');
  });

  it('only counts the study year after this round was confirmed', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const base = {
      studyYears: ['BACHELOR_1' as const],
      internationalStudent: false,
      alumni: false,
      isStudent: true,
    };
    expect(ticketAudiencesForProfile({ ...base, studyConfirmedYear: 2026 }, now)).toEqual(['FIRST_YEARS']);
    // Vorig jaar eerstejaars en nog niet bevestigd: geen eerstejaarsticket.
    expect(ticketAudiencesForProfile({ ...base, studyConfirmedYear: 2025 }, now)).toEqual([]);
    // Internationaal en alumnus zijn geen jaarlijkse gegevens.
    expect(
      ticketAudiencesForProfile(
        { ...base, studyConfirmedYear: null, internationalStudent: true, alumni: true },
        now,
      ),
    ).toEqual(['INTERNATIONALS', 'ALUMNI']);
    // Wie geen student meer is, telt niet als eerste- of laatstejaars.
    expect(
      ticketAudiencesForProfile({ ...base, isStudent: false, studyConfirmedYear: 2026 }, now),
    ).toEqual([]);
  });

  it('only gives a member price to a ticket that is also sold to non-members', () => {
    expect(ticketTypeMemberPrice({ audience: 'PUBLIC', memberPriceCents: 1_400 })).toBe(1_400);
    expect(ticketTypeMemberPrice({ audience: 'PUBLIC', memberPriceCents: null })).toBeNull();
    expect(ticketTypeMemberPrice({ audience: 'MEMBERS', memberPriceCents: 1_400 })).toBeNull();
    expect(ticketTypeMemberPrice({ audience: 'HONORARY', memberPriceCents: 1_400 })).toBeNull();
  });
});
