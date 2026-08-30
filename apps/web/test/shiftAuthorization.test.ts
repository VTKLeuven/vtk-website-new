import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import {
  canManageShift,
  isUserInShiftPost,
  userShiftPostCodes,
} from '@/lib/shift';

function createSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
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
      isStudent: true,
      googleLinked: true,
      googleLinkDeferredAt: null,
    },
    permissions: [],
    roleIds: [],
    groups: [],
    ...overrides,
  };
}

function praesidiumGroup(code: string) {
  return {
    id: `id-${code}`,
    code,
    slug: code,
    nameNl: code,
    nameEn: code,
    role: 'MEMBER' as const,
    type: 'PRAESIDIUM' as const,
  };
}

function werkgroepGroup(code: string) {
  return {
    id: `id-${code}`,
    code,
    slug: code,
    nameNl: code,
    nameEn: code,
    role: 'MEMBER' as const,
    type: 'WERKGROEP' as const,
  };
}

describe('shift authorization', () => {
  describe('userShiftPostCodes', () => {
    it('returns only praesidium group codes', () => {
      const session = createSession({
        groups: [praesidiumGroup('sport'), werkgroepGroup('onthaal'), praesidiumGroup('sociaal')],
      });
      expect(userShiftPostCodes(session)).toEqual(['sport', 'sociaal']);
    });
  });

  describe('isUserInShiftPost', () => {
    it('matches post case-insensitively', () => {
      const session = createSession({
        groups: [praesidiumGroup('sport')],
      });
      expect(isUserInShiftPost(session, 'sport')).toBe(true);
      expect(isUserInShiftPost(session, 'Sport')).toBe(true);
      expect(isUserInShiftPost(session, 'SPORT')).toBe(true);
      expect(isUserInShiftPost(session, 'theokot')).toBe(false);
      expect(isUserInShiftPost(session, null)).toBe(false);
      expect(isUserInShiftPost(session, undefined)).toBe(false);
    });

    it('does not match werkgroep groups', () => {
      const session = createSession({
        groups: [werkgroepGroup('onthaal')],
      });
      expect(isUserInShiftPost(session, 'onthaal')).toBe(false);
    });
  });

  describe('canManageShift', () => {
    it('allows superadmin to manage any shift (with post or without post)', () => {
      const superAdminSession = createSession({
        user: {
          id: 'admin',
          email: 'admin@example.test',
          name: 'Admin',
          avatarKey: null,
          locale: 'NL',
          isSuperAdmin: true,
          onboarded: true,
          studyConfirmedYear: 2026,
          isStudent: true,
          googleLinked: true,
          googleLinkDeferredAt: null,
        },
        permissions: [],
        groups: [],
      });

      expect(canManageShift(superAdminSession, { post: 'sport' })).toBe(true);
      expect(canManageShift(superAdminSession, { post: null })).toBe(true);
    });

    it('denies user without shift.edit permission even if they belong to the post', () => {
      const session = createSession({
        permissions: [],
        groups: [praesidiumGroup('sport')],
      });

      expect(canManageShift(session, { post: 'sport' })).toBe(false);
    });

    it('allows user with shift.edit to manage shifts of their own praesidium post', () => {
      const session = createSession({
        permissions: ['shift.edit'],
        groups: [praesidiumGroup('sport'), praesidiumGroup('theokot')],
      });

      expect(canManageShift(session, { post: 'sport' })).toBe(true);
      expect(canManageShift(session, { post: 'theokot' })).toBe(true);
      expect(canManageShift(session, { post: 'sociaal' })).toBe(false);
    });

    it('denies user with shift.edit from managing shifts with null post', () => {
      const session = createSession({
        permissions: ['shift.edit'],
        groups: [praesidiumGroup('sport')],
      });

      expect(canManageShift(session, { post: null })).toBe(false);
    });
  });
});
