import 'server-only';
import { prisma } from '@vtk/db';
import { currentWorkingYear, type SessionPayload } from '@vtk/auth';

/**
 * Test-login voor de Fakbar-app. Zelfde principe als de logistiek-app:
 * op lokale dev is er geen gedeelde .vtk.be-cookie, dus activeer je met
 * FAKBAR_TEST_LOGIN=true een lokale test-picker op /test-login.
 *
 * STAAT DIT NOOIT AAN IN PRODUCTIE.
 */

export function testLoginEnabled(): boolean {
  return process.env.FAKBAR_TEST_LOGIN === 'true';
}

export const TEST_USER_COOKIE = 'fakbar-test-user';
export type TestUserKey = 'fakbar' | 'it';
export const TEST_USER_KEYS: TestUserKey[] = ['fakbar', 'it'];

type TestPersona = {
  key: TestUserKey;
  name: string;
  isSuperAdmin: boolean;
  groups: { code: string; role: 'MEMBER' | 'LEAD' }[];
  permissions: string[];
};

const PERSONAS: Record<TestUserKey, TestPersona> = {
  fakbar: {
    key: 'fakbar',
    name: 'Alice (test fakbar)',
    isSuperAdmin: false,
    groups: [{ code: 'FAKBAR', role: 'LEAD' }],
    permissions: [],
  },
  it: {
    key: 'it',
    name: 'Bob (test IT superadmin)',
    isSuperAdmin: true,
    groups: [{ code: 'IT', role: 'LEAD' }],
    permissions: [],
  },
};

export function isTestUserKey(value: string | undefined | null): value is TestUserKey {
  return value != null && (TEST_USER_KEYS as string[]).includes(value);
}

function testUserId(key: TestUserKey): string {
  return `fakbar-test-user-${key}`;
}

export async function ensureTestUser(key: TestUserKey): Promise<void> {
  const p = PERSONAS[key];
  await prisma.user.upsert({
    where: { id: testUserId(key) },
    update: { name: p.name, isSuperAdmin: p.isSuperAdmin, active: true },
    create: {
      id: testUserId(key),
      email: `${key}@test.fakbar.vtk.be`,
      name: p.name,
      locale: 'NL',
      active: true,
      isSuperAdmin: p.isSuperAdmin,
      onboardedAt: new Date(),
      studyConfirmedYear: currentWorkingYear(),
    },
  });
}

export async function buildTestSession(key: TestUserKey): Promise<SessionPayload> {
  const p = PERSONAS[key];
  const codes = p.groups.map((g) => g.code);
  const rows = codes.length
    ? await prisma.group.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true, slug: true, nameNl: true, nameEn: true, type: true },
      })
    : [];
  const byCode = new Map(rows.map((r) => [r.code, r]));

  return {
    token: `test:${p.key}`,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    user: {
      id: testUserId(key),
      email: `${key}@test.fakbar.vtk.be`,
      name: p.name,
      avatarKey: null,
      locale: 'NL',
      isSuperAdmin: p.isSuperAdmin,
      onboarded: true,
      studyConfirmedYear: currentWorkingYear(),
      googleLinked: true,
      googleLinkDeferredAt: null,
    },
    groups: p.groups.flatMap((g) => {
      const row = byCode.get(g.code);
      if (!row) return [];
      return [{ id: row.id, code: row.code, slug: row.slug, nameNl: row.nameNl, nameEn: row.nameEn, role: g.role, type: row.type }];
    }),
    permissions: p.permissions,
    roleIds: [],
  };
}
