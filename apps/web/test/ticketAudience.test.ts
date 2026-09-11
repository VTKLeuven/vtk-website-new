import { describe, expect, it } from 'vitest';
import {
  ticketAudienceFrom,
  ticketTypeIsHidden,
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
});
