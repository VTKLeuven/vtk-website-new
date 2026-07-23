import 'server-only';
import { prisma } from '@vtk/db';
import { currentWorkingYear, type SessionPayload } from '@vtk/auth';

/**
 * Test-login voor de uitleendienst. Op een testomgeving (dev.vtk.be, lokaal) is
 * er geraken via de echte KU Leuven-login lastig, en logistiek heeft zelf geen
 * auth; het valideert normaal de gedeelde cookie tegen de hoofdsite. Met de
 * toggle `LOGISTIEK_TEST_LOGIN=true` kan je in plaats daarvan als een vaste
 * test-gebruiker inloggen via /test-login, om de verschillende toegangsprofielen
 * (beheer, gewone post, werkgroep, extern) los van de hoofdsite te testen.
 *
 * STAAT DEZE TOGGLE NOOIT AAN IN PRODUCTIE: de personas geven echte permissies
 * (inclusief superadmin) zonder wachtwoord. Standaard (toggle uit) verandert er
 * niets en werkt enkel de gewone website-login.
 */

/** Aan als de env-toggle expliciet op "true" staat; anders uit. */
export function testLoginEnabled(): boolean {
  return process.env.LOGISTIEK_TEST_LOGIN === 'true';
}

/** Cookie die onthoudt als welke test-gebruiker je bent ingelogd. */
export const TEST_USER_COOKIE = 'logistiek-test-user';

export type TestUserKey = 'logistiek' | 'it' | 'post' | 'mechanix' | 'student';

export const TEST_USER_KEYS: TestUserKey[] = ['logistiek', 'it', 'post', 'mechanix', 'student'];

/** Enkel code + rol; naam/slug komen uit de DB (zie buildTestSession). */
type TestGroup = {
  code: string;
  role: 'MEMBER' | 'LEAD';
};

type TestPersona = {
  key: TestUserKey;
  name: string;
  /** Korte uitleg op de picker: welk profiel dit dekt. */
  descriptionNl: string;
  descriptionEn: string;
  isSuperAdmin: boolean;
  groups: TestGroup[];
  permissions: string[];
  roleIds: string[];
};

/**
 * De vaste test-profielen. Elk dekt een ander toegangsniveau van de uitleendienst:
 * - logistiek : lid van post LOGISTIEK, heeft `logistiek.manage` -> ziet /beheer.
 * - it        : superadmin (post IT) -> ziet alles, bypasst elke check.
 * - post      : gewoon praesidiumlid (random post) -> INTERN aanvragen, geen beheer.
 * - mechanix  : werkgrooplid -> WERKGROEP aanvragen, geen beheer.
 * - student   : gewone student zonder posten -> enkel EXTERN aanvragen.
 */
const PERSONAS: Record<TestUserKey, TestPersona> = {
  logistiek: {
    key: 'logistiek',
    name: 'Alice (test logistiek)',
    descriptionNl: 'Lid van post Logistiek met beheerrechten (logistiek.manage).',
    descriptionEn: 'Logistics post member with management rights (logistiek.manage).',
    isSuperAdmin: false,
    groups: [group('LOGISTIEK', 'LEAD')],
    permissions: ['logistiek.manage', 'modules.logistiek.access'],
    roleIds: ['test-role-logistiek'],
  },
  it: {
    key: 'it',
    name: 'Bob (test IT)',
    descriptionNl: 'Superadmin (post IT): volledige toegang, bypasst elke check.',
    descriptionEn: 'Super admin (IT post): full access, bypasses every check.',
    isSuperAdmin: true,
    groups: [group('IT', 'LEAD')],
    permissions: [],
    roleIds: ['test-role-admin'],
  },
  post: {
    key: 'post',
    name: 'Carol (test post)',
    descriptionNl: 'Gewoon praesidiumlid (post Sport): geen beheer, wel interne aanvragen.',
    descriptionEn: 'Regular praesidium member (Sports post): no management, internal requests.',
    isSuperAdmin: false,
    groups: [group('SPORT', 'MEMBER')],
    permissions: ['calendar.create', 'photos.upload', 'tickets.create', 'users.search'],
    roleIds: ['test-role-praesidium'],
  },
  mechanix: {
    key: 'mechanix',
    name: 'Dave (test Mechanix)',
    descriptionNl: 'Werkgrooplid (Mechanix): werkgroep-aanvragen, geen beheer.',
    descriptionEn: 'Work group member (Mechanix): work group requests, no management.',
    isSuperAdmin: false,
    groups: [group('MECHANIX', 'MEMBER')],
    permissions: [],
    roleIds: ['test-role-werkgroep-mechanix'],
  },
  student: {
    key: 'student',
    name: 'Eve (test student)',
    descriptionNl: 'Gewone student zonder posten: enkel externe aanvragen.',
    descriptionEn: 'Regular student without posts: external requests only.',
    isSuperAdmin: false,
    groups: [],
    permissions: [],
    roleIds: [],
  },
};

function group(code: string, role: 'MEMBER' | 'LEAD'): TestGroup {
  return { code, role };
}

/** Alleen wat de picker nodig heeft (geen sessie-payload). */
export function listTestPersonas() {
  return TEST_USER_KEYS.map((key) => {
    const p = PERSONAS[key];
    return { key: p.key, name: p.name, descriptionNl: p.descriptionNl, descriptionEn: p.descriptionEn };
  });
}

export function isTestUserKey(value: string | undefined | null): value is TestUserKey {
  return value != null && (TEST_USER_KEYS as string[]).includes(value);
}

/** Stabiele, door ons gecontroleerde ids/emails, zodat FK's blijven kloppen. */
function testUserId(key: TestUserKey): string {
  return `test-user-${key}`;
}
function testUserEmail(key: TestUserKey): string {
  return `${key}@test.vtk.be`;
}

/**
 * Zorgt dat de test-gebruiker als een échte User-rij bestaat. Nodig omdat elke
 * uitleen-aanvraag een FK op `userId` legt: een verzonnen sessie-id geeft anders
 * een foreign key-fout. Idempotent; enkel bedoeld voor de test-login. Draai dit
 * in een mutatie-context (server action), niet tijdens het renderen.
 */
export async function ensureTestUser(key: TestUserKey): Promise<void> {
  const p = PERSONAS[key];
  const id = testUserId(key);
  await prisma.user.upsert({
    where: { id },
    update: { name: p.name, isSuperAdmin: p.isSuperAdmin, active: true },
    create: {
      id,
      email: testUserEmail(key),
      name: p.name,
      locale: 'NL',
      active: true,
      isSuperAdmin: p.isSuperAdmin,
      onboardedAt: new Date(),
      studyConfirmedYear: currentWorkingYear(),
    },
  });
}

/**
 * Bouwt een volwaardige SessionPayload voor de gekozen test-gebruiker. De posten
 * worden opgezocht in de DB zodat de sessie ECHTE Group-ids draagt (interne
 * materiaalaanvragen leggen een FK op de post). Ontbreekt een post in de DB
 * (nog niet geseed), dan valt die stil weg.
 */
export async function buildTestSession(key: TestUserKey): Promise<SessionPayload> {
  const p = PERSONAS[key];
  const codes = p.groups.map((g) => g.code);
  const rows = codes.length
    ? await prisma.group.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true, slug: true, nameNl: true, nameEn: true },
      })
    : [];
  const byCode = new Map(rows.map((r) => [r.code, r]));

  return {
    token: `test:${p.key}`,
    // Ver in de toekomst; deze sessie leeft enkel zolang de cookie bestaat.
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    user: {
      id: testUserId(key),
      email: testUserEmail(key),
      name: p.name,
      avatarKey: null,
      locale: 'NL',
      isSuperAdmin: p.isSuperAdmin,
      onboarded: true,
      studyConfirmedYear: currentWorkingYear(),
    },
    groups: p.groups.flatMap((g) => {
      const row = byCode.get(g.code);
      if (!row) return [];
      return [{ id: row.id, code: row.code, slug: row.slug, nameNl: row.nameNl, nameEn: row.nameEn, role: g.role }];
    }),
    permissions: p.permissions,
    roleIds: p.roleIds,
  };
}
