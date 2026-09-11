import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionPayload } from '@vtk/auth';

const mocks = vi.hoisted(() => ({
  session: null as SessionPayload | null,
  findMany: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  requireSession: vi.fn(async () => {
    if (!mocks.session) throw new Error('UNAUTHENTICATED');
    return mocks.session;
  }),
  requirePermission: vi.fn(),
  authErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401 })
  ),
}));

vi.mock('@vtk/db', () => ({
  prisma: { shift: { findMany: mocks.findMany } },
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), describeChanges: vi.fn() }));

import { GET } from '@/app/api/shift/route';
import { toRoster } from '@/lib/shift/roster';

function makeSession(userId: string): SessionPayload {
  return {
    token: 'tok',
    expiresAt: new Date(0).toISOString(),
    user: {
      id: userId,
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
  };
}

describe('toRoster', () => {
  it('lists participants in the order they signed up and marks the viewer', () => {
    const roster = toRoster(
      [
        { userId: 'user_b', registeredAt: new Date('2026-09-02T10:00:00Z'), user: { name: 'Bram' } },
        { userId: 'user_me', registeredAt: new Date('2026-09-03T10:00:00Z'), user: { name: 'Jarne' } },
        { userId: 'user_a', registeredAt: new Date('2026-09-01T10:00:00Z'), user: { name: 'Anke' } },
      ],
      'user_me'
    );

    expect(roster).toEqual([
      { name: 'Anke', isSelf: false },
      { name: 'Bram', isSelf: false },
      { name: 'Jarne', isSelf: true },
    ]);
  });
});

describe('GET /api/shift roster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = makeSession('user_me');
  });

  it('sends the names of who signed up, not their user ids', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'shift_1',
        name: 'Tapshift',
        startTime: new Date('2027-01-01T20:00:00Z'),
        endTime: new Date('2027-01-01T23:00:00Z'),
        location: 'Delta',
        description: 'Tappen',
        maxParticipants: 3,
        reward: 2,
        post: null,
        openToInternationals: false,
        instructions: null,
        participants: [
          {
            userId: 'user_other',
            registeredAt: new Date('2026-09-01T10:00:00Z'),
            user: { name: 'Anke Peeters' },
          },
        ],
      },
    ]);

    const response = await GET();
    const text = await response.text();
    const [shift] = JSON.parse(text);

    expect(shift.roster).toEqual([{ name: 'Anke Peeters', isSelf: false }]);
    expect(shift.takenSpots).toBe(1);
    expect(shift).not.toHaveProperty('participants');
    expect(text).not.toContain('user_other');
  });
});
