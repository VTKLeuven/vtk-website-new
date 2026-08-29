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
export type TestUserKey = 'student' | 'fakbar' | 'it';
export const TEST_USER_KEYS: TestUserKey[] = ['student', 'fakbar', 'it'];

type TestPersona = {
  key: TestUserKey;
  name: string;
  /** Korte omschrijving voor de knop op /test-login. */
  description: string;
  isSuperAdmin: boolean;
  groups: { code: string; role: 'MEMBER' | 'LEAD' }[];
  permissions: string[];
};

/**
 * De volgorde hieronder is de volgorde op /test-login, en ze loopt van weinig
 * naar veel rechten. `student` staat vooraan omdat dat de gewone bezoeker is:
 * verreweg de meeste mensen die op deze site komen zijn geen fakbarlid, en dat
 * is precies het geval dat je bij het bouwen het snelst vergeet te bekijken.
 */
const PERSONAS: Record<TestUserKey, TestPersona> = {
  student: {
    key: 'student',
    name: 'Sien (test student)',
    description: 'Gewoon lid, geen post. Ziet de site zoals een bezoeker die ingelogd is.',
    isSuperAdmin: false,
    // Geen enkele post: geen Beheer-tab, en /admin geeft "Geen toegang" in
    // plaats van een redirect naar de login (die is er immers al).
    groups: [],
    permissions: [],
  },
  fakbar: {
    key: 'fakbar',
    name: 'Alice (test fakbar)',
    description: 'Lid van de post Fakbar. Mag alles beheren.',
    isSuperAdmin: false,
    groups: [{ code: 'FAKBAR', role: 'LEAD' }],
    permissions: [],
  },
  it: {
    key: 'it',
    name: 'Bob (test IT)',
    description: 'Superadmin. Mag alles, ook zonder bij de post Fakbar te zitten.',
    isSuperAdmin: true,
    groups: [{ code: 'IT', role: 'LEAD' }],
    permissions: [],
  },
};

/** De persona's voor de keuzelijst op /test-login. */
export function testPersonas(): { key: TestUserKey; name: string; description: string }[] {
  return TEST_USER_KEYS.map((key) => {
    const persona = PERSONAS[key];
    return { key, name: persona.name, description: persona.description };
  });
}

/**
 * Waar je na het inloggen belandt. Wie niets te beheren heeft, hoort niet op een
 * scherm te landen dat "Geen toegang" zegt; die begint gewoon op de homepagina.
 */
export function testPersonaLanding(key: TestUserKey): string {
  const persona = PERSONAS[key];
  const manages = persona.isSuperAdmin || persona.groups.some((group) => group.code === 'FAKBAR');
  return manages ? '/admin' : '/';
}

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
