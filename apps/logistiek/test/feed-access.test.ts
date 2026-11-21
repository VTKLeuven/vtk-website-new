import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wie een agendafeed nog mag lezen (S1 uit de audit van november 2026).
 *
 * Een teamfeed draagt de aanvrager, de nummers, de bijrijders en de adressen
 * van elke rit voor het komende jaar. Het token verandert nooit; de rechten
 * van zijn eigenaar wel (15 juli, of uit de chauffeurslijst). De route moet
 * dus bij elke poll de rechten van nu toetsen, en een token dat lang niemand
 * ophaalde, vervalt.
 */

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  driverCount: vi.fn(),
  membershipCount: vi.fn(),
  membershipFindMany: vi.fn(),
  bookingCount: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenUpdate: vi.fn(),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    uitleenDriver: { count: db.driverCount },
    groupMembership: { count: db.membershipCount, findMany: db.membershipFindMany },
    uitleenTransportBooking: { count: db.bookingCount },
    uitleenFeedToken: { findUnique: db.tokenFindUnique, update: db.tokenUpdate },
  },
  searchUsers: vi.fn(),
}));

vi.mock('@/lib/calendar/transport-feed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/calendar/transport-feed')>()),
  buildTransportFeed: vi.fn(async () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'),
}));

const { FEED_IDLE_DAYS, isFeedTokenExpired, liveFeedTokenWhere, createFeedToken, hashFeedToken } =
  await import('@/lib/calendar/feed-token');
const { feedOwnerMayRead } = await import('@/lib/calendar/feed-access');
const { GET } = await import('@/app/api/kalender/[token]/route');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-21T12:00:00.000Z');

function role(...codes: string[]) {
  return { id: `role-${codes.join('-')}`, permissions: codes.map((code) => ({ permission: { code } })) };
}

function user(over: Record<string, unknown> = {}) {
  return { id: 'u1', active: true, deletedAt: null, isSuperAdmin: false, roles: [], memberships: [], ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.driverCount.mockResolvedValue(0);
  db.membershipCount.mockResolvedValue(0);
  db.membershipFindMany.mockResolvedValue([]);
  db.bookingCount.mockResolvedValue(0);
  db.tokenUpdate.mockResolvedValue({});
});

describe('isFeedTokenExpired', () => {
  it('telt vanaf de laatste ophaling', () => {
    const recent = { lastUsedAt: new Date(NOW.getTime() - 10 * DAY), createdAt: new Date('2025-01-01') };
    expect(isFeedTokenExpired(recent, NOW)).toBe(false);
    const stale = { lastUsedAt: new Date(NOW.getTime() - (FEED_IDLE_DAYS + 1) * DAY), createdAt: new Date('2025-01-01') };
    expect(isFeedTokenExpired(stale, NOW)).toBe(true);
  });

  it('telt een nooit opgehaald token vanaf het aanmaken', () => {
    expect(isFeedTokenExpired({ lastUsedAt: null, createdAt: new Date(NOW.getTime() - 5 * DAY) }, NOW)).toBe(false);
    expect(
      isFeedTokenExpired({ lastUsedAt: null, createdAt: new Date(NOW.getTime() - (FEED_IDLE_DAYS + 1) * DAY) }, NOW)
    ).toBe(true);
  });

  it('zegt in de databank hetzelfde als in de code', () => {
    const where = liveFeedTokenWhere(NOW);
    const cutoff = new Date(NOW.getTime() - FEED_IDLE_DAYS * DAY);
    expect(where).toEqual({
      revokedAt: null,
      OR: [{ lastUsedAt: { gte: cutoff } }, { lastUsedAt: null, createdAt: { gte: cutoff } }],
    });
  });
});

describe('feedOwnerMayRead', () => {
  it('geeft een teamfeed enkel aan wie dit werkingsjaar logistiek.manage heeft', async () => {
    db.userFindUnique.mockResolvedValue(user({ roles: [{ role: role('logistiek.manage') }] }));
    await expect(feedOwnerMayRead('TEAM', 'u1')).resolves.toBe(true);

    // Na 15 juli: geen rollen en geen posten meer voor het nieuwe jaar.
    db.userFindUnique.mockResolvedValue(user());
    await expect(feedOwnerMayRead('TEAM', 'u1')).resolves.toBe(false);
  });

  it('volgt de rol die een post toekent, en LEADER enkel voor de verantwoordelijke', async () => {
    const group = { roleGrants: [{ kind: 'LEADER', role: role('logistiek.manage') }] };
    db.userFindUnique.mockResolvedValue(user({ memberships: [{ role: 'MEMBER', group }] }));
    await expect(feedOwnerMayRead('TEAM', 'u1')).resolves.toBe(false);
    db.userFindUnique.mockResolvedValue(user({ memberships: [{ role: 'LEAD', group }] }));
    await expect(feedOwnerMayRead('TEAM', 'u1')).resolves.toBe(true);
  });

  it('laat de superadmin door en een inactief account niet', async () => {
    db.userFindUnique.mockResolvedValue(user({ isSuperAdmin: true }));
    await expect(feedOwnerMayRead('TEAM', 'u1')).resolves.toBe(true);
    db.userFindUnique.mockResolvedValue(user({ active: false, roles: [{ role: role('logistiek.manage') }] }));
    await expect(feedOwnerMayRead('TEAM', 'u1')).resolves.toBe(false);
  });

  it('geeft een chauffeursfeed aan wie in de pool staat of nog een rit heeft', async () => {
    await expect(feedOwnerMayRead('DRIVER', 'u1')).resolves.toBe(false);

    db.driverCount.mockResolvedValue(1);
    await expect(feedOwnerMayRead('DRIVER', 'u1')).resolves.toBe(true);

    // Uit de pool, maar er staat nog een rit op zijn naam: die moet hij rijden.
    db.driverCount.mockResolvedValue(0);
    db.bookingCount.mockResolvedValue(1);
    await expect(feedOwnerMayRead('DRIVER', 'u1')).resolves.toBe(true);
  });
});

describe('GET /api/kalender/[token]', () => {
  const token = createFeedToken();

  function row(over: Record<string, unknown> = {}) {
    return {
      id: 't1',
      userId: 'u1',
      scope: 'TEAM',
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(Date.now() - 200 * DAY),
      user: { active: true, deletedAt: null },
      ...over,
    };
  }

  async function fetchFeed() {
    return GET(new Request(`https://logistiek.vtk.be/api/kalender/${token}`), {
      params: Promise.resolve({ token: `${token}.ics` }),
    });
  }

  it('zoekt op de hash en niet op het token', async () => {
    db.tokenFindUnique.mockResolvedValue(null);
    await fetchFeed();
    expect(db.tokenFindUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashFeedToken(token) });
  });

  it('serveert de feed zolang de eigenaar de rechten heeft', async () => {
    db.tokenFindUnique.mockResolvedValue(row());
    db.userFindUnique.mockResolvedValue(user({ roles: [{ role: role('logistiek.manage') }] }));
    const response = await fetchFeed();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('antwoordt 404 voor een teamfeed waarvan de eigenaar logistiek.manage verloor', async () => {
    db.tokenFindUnique.mockResolvedValue(row());
    db.userFindUnique.mockResolvedValue(user());
    expect((await fetchFeed()).status).toBe(404);
  });

  it('antwoordt 404 voor een token dat 90 dagen niemand ophaalde', async () => {
    db.tokenFindUnique.mockResolvedValue(row({ lastUsedAt: new Date(Date.now() - (FEED_IDLE_DAYS + 1) * DAY) }));
    db.userFindUnique.mockResolvedValue(user({ roles: [{ role: role('logistiek.manage') }] }));
    expect((await fetchFeed()).status).toBe(404);
    // Zelfs niet meer naar de rechten gekeken: het token is gewoon op.
    expect(db.userFindUnique).not.toHaveBeenCalled();
  });

  it('antwoordt 404 voor een chauffeur die uit de lijst viel en geen ritten meer heeft', async () => {
    db.tokenFindUnique.mockResolvedValue(row({ scope: 'DRIVER' }));
    expect((await fetchFeed()).status).toBe(404);
    db.driverCount.mockResolvedValue(1);
    expect((await fetchFeed()).status).toBe(200);
  });
});
