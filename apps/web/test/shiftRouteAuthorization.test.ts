import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionPayload } from '@vtk/auth';

const mocks = vi.hoisted(() => ({
  session: null as SessionPayload | null,
  findUnique: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  requireSession: vi.fn(async () => {
    if (!mocks.session) throw new Error('UNAUTHENTICATED');
    return mocks.session;
  }),
  requirePermission: vi.fn(async (perm: string) => {
    if (!mocks.session) throw new Error('UNAUTHENTICATED');
    if (!mocks.session.user.isSuperAdmin && !mocks.session.permissions.includes(perm)) {
      throw new Error('FORBIDDEN');
    }
    return mocks.session;
  }),
  authErrorResponse: vi.fn((err: unknown) => {
    const message = err instanceof Error ? err.message : 'UNAUTHENTICATED';
    const status = message === 'FORBIDDEN' ? 403 : 401;
    return new Response(JSON.stringify({ error: message }), { status });
  }),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    shift: {
      findUnique: mocks.findUnique,
      delete: mocks.delete,
      create: mocks.create,
      update: vi.fn(),
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/audit', () => ({
  logAudit: mocks.logAudit,
  describeChanges: vi.fn(() => 'wijziging'),
}));

import { DELETE, PATCH, POST } from '@/app/api/shift/route';

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    token: 'tok',
    expiresAt: new Date(0).toISOString(),
    user: {
      id: 'user_1',
      email: 'user@example.test',
      name: 'User',
      avatarKey: null,
      locale: 'NL',
      isSuperAdmin: false,
      onboarded: true,
      studyConfirmedYear: 2026,
      googleLinked: true,
      googleLinkDeferredAt: null,
    },
    permissions: ['shift.edit'],
    roleIds: [],
    groups: [
      {
        id: 'group_sport',
        code: 'sport',
        slug: 'sport',
        nameNl: 'Sport',
        nameEn: 'Sports',
        role: 'MEMBER',
        type: 'PRAESIDIUM',
      },
    ],
    ...overrides,
  };
}

describe('/api/shift authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = makeSession();
    mocks.findUnique.mockResolvedValue({
      id: 'shift_1',
      name: 'Sportshift',
      post: 'sport',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      location: 'Hal',
      description: 'Desc',
      maxParticipants: 2,
      reward: 1,
      openToInternationals: false,
      instructions: null,
    });
    mocks.delete.mockResolvedValue({ id: 'shift_1', name: 'Sportshift' });
    mocks.create.mockResolvedValue({ id: 'shift_1', name: 'Sportshift' });
    mocks.transaction.mockResolvedValue([]);
  });

  describe('DELETE /api/shift', () => {
    it('allows a praesidium member to delete a shift of their own post', async () => {
      const request = new Request('https://vtk.be/api/shift?id=shift_1', { method: 'DELETE' });
      const response = await DELETE(request);
      expect(response.status).toBe(200);
      expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'shift_1' } });
    });

    it('rejects a praesidium member attempting to delete a shift of another post', async () => {
      mocks.findUnique.mockResolvedValue({
        id: 'shift_2',
        name: 'Theokotshift',
        post: 'theokot',
      });
      const request = new Request('https://vtk.be/api/shift?id=shift_2', { method: 'DELETE' });
      const response = await DELETE(request);
      expect(response.status).toBe(403);
      expect(mocks.delete).not.toHaveBeenCalled();
    });

    it('rejects a praesidium member attempting to delete a shift without a post', async () => {
      mocks.findUnique.mockResolvedValue({
        id: 'shift_3',
        name: 'Postless shift',
        post: null,
      });
      const request = new Request('https://vtk.be/api/shift?id=shift_3', { method: 'DELETE' });
      const response = await DELETE(request);
      expect(response.status).toBe(403);
      expect(mocks.delete).not.toHaveBeenCalled();
    });

    it('allows superadmin to delete any shift', async () => {
      mocks.session = makeSession({
        user: {
          id: 'admin_1',
          email: 'admin@example.test',
          name: 'Admin',
          avatarKey: null,
          locale: 'NL',
          isSuperAdmin: true,
          onboarded: true,
          studyConfirmedYear: 2026,
          googleLinked: true,
          googleLinkDeferredAt: null,
        },
        groups: [],
      });
      mocks.findUnique.mockResolvedValue({
        id: 'shift_2',
        name: 'Theokotshift',
        post: 'theokot',
      });
      const request = new Request('https://vtk.be/api/shift?id=shift_2', { method: 'DELETE' });
      const response = await DELETE(request);
      expect(response.status).toBe(200);
      expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'shift_2' } });
    });
  });

  describe('PATCH /api/shift', () => {
    it('allows a praesidium member to modify a shift of their own post', async () => {
      const request = new Request('https://vtk.be/api/shift?id=shift_1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nieuwe naam' }),
      });
      const response = await PATCH(request);
      expect(response.status).toBe(200);
    });

    it('rejects modifying a shift of another post', async () => {
      mocks.findUnique.mockResolvedValue({
        id: 'shift_2',
        name: 'Theokotshift',
        post: 'theokot',
        startTime: new Date('2027-01-01T10:00:00Z'),
        endTime: new Date('2027-01-01T12:00:00Z'),
      });
      const request = new Request('https://vtk.be/api/shift?id=shift_2', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nieuwe naam' }),
      });
      const response = await PATCH(request);
      expect(response.status).toBe(403);
    });

    it('rejects changing the post to a post the user does not belong to', async () => {
      const request = new Request('https://vtk.be/api/shift?id=shift_1', {
        method: 'PATCH',
        body: JSON.stringify({ post: 'theokot' }),
      });
      const response = await PATCH(request);
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/shift', () => {
    it('allows creating a shift for own post', async () => {
      const request = new Request('https://vtk.be/api/shift', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Nieuwe sportshift',
          startTime: '2027-01-01T10:00',
          endTime: '2027-01-01T12:00',
          location: 'Hal',
          description: 'Desc',
          maxParticipants: 2,
          reward: 1,
          post: 'sport',
          openToInternationals: false,
        }),
      });
      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('rejects creating a shift for another post', async () => {
      const request = new Request('https://vtk.be/api/shift', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Nieuwe theokotshift',
          startTime: '2027-01-01T10:00',
          endTime: '2027-01-01T12:00',
          location: 'Theokot',
          description: 'Desc',
          maxParticipants: 2,
          reward: 1,
          post: 'theokot',
          openToInternationals: false,
        }),
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it('rejects creating a shift without a post for non-superadmins', async () => {
      const request = new Request('https://vtk.be/api/shift', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Postless shift',
          startTime: '2027-01-01T10:00',
          endTime: '2027-01-01T12:00',
          location: 'Hal',
          description: 'Desc',
          maxParticipants: 2,
          reward: 1,
          post: null,
          openToInternationals: false,
        }),
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
    });
  });
});
