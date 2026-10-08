import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Afgenomen shiften (`lib/shift/deductions.ts`): een `ManualShiftGrant` met een
 * negatief aantal, zonder shiften erachter. Wat hier vastligt: welke rijen een
 * afname zijn, hoe ze opgeteld worden, dat een getoond aantal nooit onder nul
 * gaat, en dat de voorverkoop voor vaste medewerkers ze aftrekt.
 */

const mocks = vi.hoisted(() => ({
  grantFindMany: vi.fn(),
  participantCount: vi.fn(),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    manualShiftGrant: { findMany: mocks.grantFindMany },
    shiftParticipant: { count: mocks.participantCount },
  },
}));

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

import { deductedShifts, netShiftCount, shiftDeductions } from '@/lib/shift/deductions';
import { completedShiftsThisWorkingYear } from '@/lib/ticketing/presaleViewer';
import { currentWorkingYear } from '@/lib/workingYear';

describe('shiftDeductions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grantFindMany.mockResolvedValue([]);
  });

  it('haalt enkel rijen met een negatief aantal op, per lid en per jaar', async () => {
    mocks.grantFindMany.mockResolvedValue([
      { userId: 'u1', post: 'BAR', count: -2, academicYear: 2026, user: { name: 'Jef' } },
    ]);

    const rows = await shiftDeductions({ userIds: ['u1', 'u1'], academicYear: 2026 });

    expect(mocks.grantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { count: { lt: 0 }, userId: { in: ['u1'] }, academicYear: 2026 },
      }),
    );
    expect(rows).toEqual([{ userId: 'u1', name: 'Jef', post: 'BAR', count: -2, academicYear: 2026 }]);
  });

  it('vraagt niets op voor een lege lijst leden', async () => {
    expect(await shiftDeductions({ userIds: [] })).toEqual([]);
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
  });
});

describe('deductedShifts / netShiftCount', () => {
  it('telt de afnames op als positief getal', () => {
    expect(deductedShifts([])).toBe(0);
    expect(deductedShifts([{ count: -1 }, { count: -3 }])).toBe(4);
  });

  it('gaat nooit onder nul, maar de afname blijft staan', () => {
    expect(netShiftCount(5, 1)).toBe(4);
    expect(netShiftCount(0, 1)).toBe(0);
    // Eén afgenomen op nul: de volgende shift brengt je terug op nul, niet op één.
    expect(netShiftCount(1, 1)).toBe(0);
  });
});

describe('completedShiftsThisWorkingYear', () => {
  it('trekt de afnames van dit werkingsjaar af van de vijftien', async () => {
    mocks.participantCount.mockResolvedValue(15);
    mocks.grantFindMany.mockResolvedValue([
      { userId: 'u1', post: null, count: -1, academicYear: currentWorkingYear(), user: { name: 'Jef' } },
    ]);

    expect(await completedShiftsThisWorkingYear('u1')).toBe(14);
    expect(mocks.grantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['u1'] }, academicYear: currentWorkingYear() }),
      }),
    );
  });
});
