import { describe, expect, it } from 'vitest';
import {
  ticketAudienceFrom,
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
    expect(ticketTypeIsHidden({ audience: 'HONORARY' }, false)).toBe(true);
    expect(ticketTypeIsHidden({ audience: 'HONORARY' }, true)).toBe(false);
    expect(ticketTypeIsHidden({ audience: 'MEMBERS' }, false)).toBe(false);
    expect(ticketTypeIsHidden({ audience: 'PUBLIC' }, false)).toBe(false);
  });

  it('only gives a member price to a ticket that is also sold to non-members', () => {
    expect(ticketTypeMemberPrice({ audience: 'PUBLIC', memberPriceCents: 1_400 })).toBe(1_400);
    expect(ticketTypeMemberPrice({ audience: 'PUBLIC', memberPriceCents: null })).toBeNull();
    expect(ticketTypeMemberPrice({ audience: 'MEMBERS', memberPriceCents: 1_400 })).toBeNull();
    expect(ticketTypeMemberPrice({ audience: 'HONORARY', memberPriceCents: 1_400 })).toBeNull();
  });
});
