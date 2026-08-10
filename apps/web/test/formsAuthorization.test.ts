import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import {
  canSessionCreateFormForGroup,
  capabilitiesForFormRoles,
} from '@/lib/forms/authorization';

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    token: 'token',
    expiresAt: new Date(0).toISOString(),
    user: {
      id: 'user',
      email: 'user@example.test',
      name: 'User',
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

function group(id: string, role: 'MEMBER' | 'LEAD') {
  return { id, code: id, slug: id, nameNl: id, nameEn: id, role };
}

describe('formulierrollen', () => {
  it('houdt een viewer op lezen en exporteren', () => {
    const capabilities = capabilitiesForFormRoles(['VIEWER']);
    expect(capabilities).toEqual(['VIEW_FORM', 'VIEW_ENTRIES', 'EXPORT']);
    expect(capabilities).not.toContain('MANAGE_ENTRIES');
    expect(capabilities).not.toContain('MAIL_PARTICIPANTS');
  });

  it('laat een editor inzendingen beheren maar niet het formulier zelf', () => {
    const capabilities = capabilitiesForFormRoles(['EDITOR']);
    expect(capabilities).toContain('MANAGE_ENTRIES');
    expect(capabilities).toContain('MAIL_PARTICIPANTS');
    expect(capabilities).not.toContain('MANAGE_FORM');
    expect(capabilities).not.toContain('MANAGE_ACCESS');
  });

  it('geeft een manager alles', () => {
    const capabilities = capabilitiesForFormRoles(['MANAGER']);
    expect(capabilities).toContain('MANAGE_FORM');
    expect(capabilities).toContain('MANAGE_ACCESS');
    expect(capabilities).toContain('VIEW_AUDIT');
  });

  it('telt meerdere rollen op zonder een rol te verbreden', () => {
    const capabilities = capabilitiesForFormRoles(['VIEWER', 'EDITOR']);
    expect(capabilities).toEqual(expect.arrayContaining(['EXPORT', 'MANAGE_ENTRIES']));
    expect(capabilities).not.toContain('MANAGE_FORM');
    // Elke capability hoort er exact één keer in te staan.
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });
});

describe('formulier aanmaken vanuit de sessie', () => {
  it('vraagt forms.create én de leiding van die post', () => {
    const actor = session({
      permissions: ['forms.create'],
      groups: [group('group-a', 'LEAD'), group('group-b', 'MEMBER')],
    });

    expect(canSessionCreateFormForGroup(actor, 'group-a')).toBe(true);
    expect(canSessionCreateFormForGroup(actor, 'group-b')).toBe(false);
    expect(canSessionCreateFormForGroup(actor, 'group-c')).toBe(false);
  });

  it('laat forms.manageAll voor elke post aanmaken, ook zonder lidmaatschap', () => {
    const actor = session({ permissions: ['forms.manageAll'] });
    expect(canSessionCreateFormForGroup(actor, 'group-a')).toBe(true);
  });

  it('geeft een gewoon lid zonder permissie niets', () => {
    const actor = session({ groups: [group('group-a', 'LEAD')] });
    expect(canSessionCreateFormForGroup(actor, 'group-a')).toBe(false);
  });
});
