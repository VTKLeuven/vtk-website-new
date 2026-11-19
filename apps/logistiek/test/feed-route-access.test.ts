import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De agendafeed controleert het recht bij elke lezing, niet enkel bij het
 * aanmaken van het token.
 *
 * Een TEAM-feed draagt de hele planning, met adressen en de nummers van
 * contactpersonen en helpers. Na de reset van 15 juli bleef ze werken voor het
 * team van vorig jaar, want de route keek enkel of het token bestond.
 */

const { tokenFindUnique, userFindUnique, buildTransportFeed } = vi.hoisted(() => ({
  tokenFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  buildTransportFeed: vi.fn(async () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    uitleenFeedToken: { findUnique: tokenFindUnique, update: vi.fn(async () => ({})) },
    user: { findUnique: userFindUnique },
  },
}));
vi.mock('@/lib/calendar/transport-feed', () => ({ buildTransportFeed }));

const { GET } = await import('@/app/api/kalender/[token]/route');
const { isFeedToken } = await import('@/lib/calendar/feed-token');

const TOKEN = `vtk_log_${'a'.repeat(43)}`;

function request(scope: 'TEAM' | 'DRIVER') {
  tokenFindUnique.mockResolvedValue({
    id: 'tok',
    userId: 'u1',
    scope,
    revokedAt: null,
    lastUsedAt: new Date(),
    user: { active: true, deletedAt: null },
  });
  return GET(new Request(`https://logistiek.vtk.be/api/kalender/${TOKEN}`), {
    params: Promise.resolve({ token: TOKEN }),
  });
}

function grants(permissions: { superAdmin?: boolean; direct?: boolean; viaPost?: 'DEFAULT' | 'LEADER' | null; lead?: boolean }) {
  userFindUnique.mockResolvedValue({
    active: true,
    deletedAt: null,
    isSuperAdmin: permissions.superAdmin ?? false,
    roles: permissions.direct ? [{ roleId: 'r' }] : [],
    memberships: permissions.viaPost
      ? [{ role: permissions.lead ? 'LEAD' : 'MEMBER', group: { roleGrants: [{ kind: permissions.viaPost }] } }]
      : [],
  });
}

beforeEach(() => {
  tokenFindUnique.mockReset();
  userFindUnique.mockReset();
  buildTransportFeed.mockClear();
});

describe('GET /api/kalender/[token]', () => {
  it('uses a token in the expected format', () => {
    expect(isFeedToken(TOKEN)).toBe(true);
  });

  it('serves the team feed while the owner still manages logistiek', async () => {
    grants({ viaPost: 'DEFAULT' });
    const response = await request('TEAM');
    expect(response.status).toBe(200);
    expect(buildTransportFeed).toHaveBeenCalledWith('TEAM', 'u1');
  });

  it('hides the team feed once the owner lost the right', async () => {
    grants({});
    const response = await request('TEAM');
    expect(response.status).toBe(404);
    expect(buildTransportFeed).not.toHaveBeenCalled();
  });

  it('does not count a leader grant for an ordinary member', async () => {
    grants({ viaPost: 'LEADER' });
    expect((await request('TEAM')).status).toBe(404);
    grants({ viaPost: 'LEADER', lead: true });
    expect((await request('TEAM')).status).toBe(200);
  });

  it('lets a superadmin and a direct role through', async () => {
    grants({ superAdmin: true });
    expect((await request('TEAM')).status).toBe(200);
    grants({ direct: true });
    expect((await request('TEAM')).status).toBe(200);
  });

  it('leaves the driver feed alone: it only carries your own trips', async () => {
    grants({});
    expect((await request('DRIVER')).status).toBe(200);
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});
