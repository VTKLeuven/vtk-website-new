import { describe, expect, it, vi } from 'vitest';
import { searchUsers } from '@vtk/db';
import type { PrismaClient } from '@prisma/client';

describe('searchUsers', () => {
  it('geeft een lege array terug voor zoektermen onder 2 tekens', async () => {
    expect(await searchUsers('')).toEqual([]);
    expect(await searchUsers(' ')).toEqual([]);
    expect(await searchUsers('a')).toEqual([]);
  });

  it('voert een SQL unaccent query uit wanneer unaccent beschikbaar is', async () => {
    const mockUsers = [
      { id: '1', name: 'Zoë Sabbe', email: 'zoe@vtk.be', rNumber: 'r0123456', phone: null },
    ];
    const mockQueryRaw = vi.fn().mockResolvedValue(mockUsers);
    const mockDb = {
      $queryRaw: mockQueryRaw,
      user: { findMany: vi.fn() },
    } as unknown as PrismaClient;

    const results = await searchUsers('zoe', { limit: 10, db: mockDb });

    expect(results).toEqual(mockUsers);
    expect(mockQueryRaw).toHaveBeenCalledOnce();
    // findMany mag niet aangeroepen zijn omdat queryRaw slaagde
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
  });

  it('splitst meerdere termen op in aparte unaccent condities', async () => {
    const mockQueryRaw = vi.fn().mockResolvedValue([]);
    const mockDb = {
      $queryRaw: mockQueryRaw,
      user: { findMany: vi.fn() },
    } as unknown as PrismaClient;

    await searchUsers('danaë velde', { limit: 10, db: mockDb });

    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  it('valt terug op findMany wanneer queryRaw faalt (bv. ontbrekende unaccent extensie)', async () => {
    const mockUsers = [
      { id: '2', name: 'Théo Dupont', email: 'theo@vtk.be', rNumber: 'r0654321', phone: null },
    ];
    const mockQueryRaw = vi.fn().mockRejectedValue(new Error('function unaccent does not exist'));
    const mockFindMany = vi.fn().mockResolvedValue(mockUsers);
    const mockDb = {
      $queryRaw: mockQueryRaw,
      user: { findMany: mockFindMany },
    } as unknown as PrismaClient;

    const results = await searchUsers('theo', { limit: 20, db: mockDb });

    expect(results).toEqual(mockUsers);
    expect(mockQueryRaw).toHaveBeenCalledOnce();
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        active: true,
        deletedAt: null,
        AND: [
          {
            OR: [
              { name: { contains: 'theo', mode: 'insensitive' } },
              { email: { contains: 'theo', mode: 'insensitive' } },
              { rNumber: { contains: 'theo', mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true, email: true, rNumber: true, phone: true },
    });
  });
});
