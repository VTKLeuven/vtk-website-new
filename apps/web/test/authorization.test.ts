import { describe, expect, it } from 'vitest';
import { capabilitiesForTicketRoles } from '@/lib/ticketing/authorization';

describe('event-scoped ticket roles', () => {
  it('keeps reporter and scanner data access narrow', () => {
    expect(capabilitiesForTicketRoles(['REPORTER'])).toEqual(['VIEW_EVENT', 'VIEW_REPORTS']);
    expect(capabilitiesForTicketRoles(['SCANNER'])).toEqual(['VIEW_EVENT', 'SCAN']);
  });

  it('unions multiple roles without widening unrelated roles', () => {
    const capabilities = capabilitiesForTicketRoles(['REPORTER', 'SCANNER']);
    expect(capabilities).toEqual(expect.arrayContaining(['VIEW_EVENT', 'VIEW_REPORTS', 'SCAN']));
    expect(capabilities).not.toContain('VIEW_ATTENDEES');
    expect(capabilities).not.toContain('VIEW_FINANCE');
  });

  it('gives owners every capability', () => {
    expect(capabilitiesForTicketRoles(['OWNER'])).toContain('MANAGE_ACCESS');
    expect(capabilitiesForTicketRoles(['OWNER'])).toContain('REFUND');
  });
});
