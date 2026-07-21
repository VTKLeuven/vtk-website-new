import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import {
  canSessionCreateTicketEventForGroup,
  capabilitiesForTicketRoles,
} from '@/lib/ticketing/authorization';
import {
  AUTHORIZATION_PREVIEW_STOP_PATH,
  blocksAuthorizationPreviewMutation,
} from '@/lib/authorization-preview-constants';
import {
  decodeAuthorizationPreview,
  encodeAuthorizationPreview,
} from '@/lib/authorization-preview-selection';

function previewSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    token: 'token',
    expiresAt: new Date(0).toISOString(),
    user: {
      id: 'admin',
      email: 'admin@example.test',
      name: 'Admin',
      avatarKey: null,
      locale: 'NL',
      isSuperAdmin: false,
      onboarded: true,
      studyConfirmedYear: 2026,
    },
    permissions: [],
    roleIds: [],
    groups: [],
    ...overrides,
  };
}

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

describe('authorization preview', () => {
  it('round-trips, validates and deduplicates the cookie selection', () => {
    const encoded = encodeAuthorizationPreview({
      actorId: 'admin',
      roleIds: ['role-a', 'role-a'],
      groups: [
        { id: 'group-a', role: 'MEMBER' },
        { id: 'group-a', role: 'LEAD' },
      ],
    });

    expect(decodeAuthorizationPreview(encoded)).toEqual({
      actorId: 'admin',
      roleIds: ['role-a'],
      groups: [{ id: 'group-a', role: 'LEAD' }],
    });
    expect(decodeAuthorizationPreview('not-json')).toBeNull();
  });

  it('blocks mutations while keeping reads and the stop endpoint available', () => {
    expect(blocksAuthorizationPreviewMutation(true, 'POST', '/nl/admin')).toBe(true);
    expect(blocksAuthorizationPreviewMutation(true, 'DELETE', '/api/users/1')).toBe(true);
    expect(blocksAuthorizationPreviewMutation(true, 'GET', '/nl/admin')).toBe(false);
    expect(blocksAuthorizationPreviewMutation(true, 'POST', AUTHORIZATION_PREVIEW_STOP_PATH)).toBe(false);
    expect(blocksAuthorizationPreviewMutation(false, 'POST', '/nl/admin')).toBe(false);
  });

  it('uses only effective preview permissions and post leadership for ticket creation', () => {
    const session = previewSession({
      permissions: ['tickets.create'],
      groups: [
        {
          id: 'group-a',
          code: 'a',
          slug: 'a',
          nameNl: 'A',
          nameEn: 'A',
          role: 'LEAD',
        },
        {
          id: 'group-b',
          code: 'b',
          slug: 'b',
          nameNl: 'B',
          nameEn: 'B',
          role: 'MEMBER',
        },
      ],
    });

    expect(canSessionCreateTicketEventForGroup(session, 'group-a')).toBe(true);
    expect(canSessionCreateTicketEventForGroup(session, 'group-b')).toBe(false);
    expect(canSessionCreateTicketEventForGroup(session, 'group-c')).toBe(false);
  });
});
