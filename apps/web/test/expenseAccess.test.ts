import { describe, expect, it, vi } from 'vitest';
import type { SessionPayload } from '@vtk/auth';

vi.mock('@vtk/db', () => ({ prisma: {} }));
vi.mock('@vtk/mail', () => ({ defaultMailFrom: () => 'noreply@vtk.be' }));
vi.mock('@/lib/session', () => ({ getCurrentSession: vi.fn(), requireSession: vi.fn() }));

import {
  accessFor,
  canDelete,
  canEdit,
  canReimburse,
  canView,
  visibilityWhere,
} from '@/lib/rekeningen/server';

/** Minimale sessie; enkel de velden die de rekeningen lezen. */
function session(opts: { permissions?: string[]; groups?: string[]; isSuperAdmin?: boolean }): SessionPayload {
  return {
    user: { id: 'me', isSuperAdmin: opts.isSuperAdmin ?? false },
    permissions: opts.permissions ?? [],
    groups: (opts.groups ?? []).map((id) => ({ id })),
  } as unknown as SessionPayload;
}

const expense = (
  overrides: Partial<{
    groupId: string | null;
    kiesploegId: string | null;
    submittedById: string | null;
    paymentMethod: 'PERSONAL' | 'VTK_CARD';
    paidAt: Date | null;
    sentAt: Date | null;
    bookedAt: Date | null;
  }> = {},
) => ({
  groupId: 'cudi',
  kiesploegId: null as string | null,
  submittedById: 'someone-else',
  paymentMethod: 'PERSONAL' as const,
  paidAt: null,
  sentAt: null,
  bookedAt: null,
  ...overrides,
});

const at = new Date('2026-10-01T10:00:00.000Z');

describe('expenses.reimbursePost', () => {
  const reimburser = accessFor(session({ permissions: ['expenses.reimbursePost'], groups: ['cudi'] }));

  it('ziet de rekeningen van de eigen werkgroep, en enkel die', () => {
    expect(reimburser.canSeeOverview).toBe(true);
    expect(reimburser.postScope).toEqual(['cudi']);
    expect(canView(reimburser, expense())).toBe(true);
    expect(canView(reimburser, expense({ groupId: 'theokot' }))).toBe(false);
    expect(visibilityWhere(reimburser)).toEqual({
      OR: [{ groupId: { in: ['cudi'] } }, { submittedById: 'me' }],
    });
  });

  it('zet een open rekening van de eigen werkgroep op terugbetaald, en haalt het vinkje weer weg', () => {
    expect(canReimburse(reimburser, expense())).toBe(true);
    expect(canReimburse(reimburser, expense({ paidAt: at }))).toBe(true);
  });

  it('raakt geen rekening van een andere post of zonder post aan', () => {
    expect(canReimburse(reimburser, expense({ groupId: 'theokot' }))).toBe(false);
    expect(canReimburse(reimburser, expense({ groupId: null }))).toBe(false);
  });

  it('laat een rekening met de VTK-kaart staan: daar valt niets terug te betalen', () => {
    expect(canReimburse(reimburser, expense({ paymentMethod: 'VTK_CARD', paidAt: at }))).toBe(false);
  });

  it('laat het vinkje los zodra Beheer de rekening doorstuurde of inboekte', () => {
    expect(canReimburse(reimburser, expense({ paidAt: at, sentAt: at }))).toBe(false);
    expect(canReimburse(reimburser, expense({ paidAt: at, bookedAt: at }))).toBe(false);
  });

  it('geeft geen bewerken of verwijderen van andermans rekening', () => {
    expect(canEdit(reimburser, expense())).toBe(false);
    expect(canDelete(reimburser, expense())).toBe(false);
  });
});

describe('terugbetalen zonder expenses.reimbursePost', () => {
  it('blijft dicht voor een postbeheerder', () => {
    const manager = accessFor(session({ permissions: ['expenses.managePost'], groups: ['cudi'] }));
    expect(canEdit(manager, expense())).toBe(true);
    expect(canReimburse(manager, expense())).toBe(false);
  });

  it('blijft dicht voor de indiener zelf', () => {
    const submitter = accessFor(session({ permissions: ['expenses.submit'], groups: ['cudi'] }));
    expect(canReimburse(submitter, expense({ submittedById: 'me' }))).toBe(false);
  });

  it('staat altijd open voor volledig beheer', () => {
    const beheer = accessFor(session({ permissions: ['expenses.manage'] }));
    expect(canReimburse(beheer, expense({ groupId: 'theokot', sentAt: at }))).toBe(true);
  });
});

describe('de post Ploeg van een kiesploeg', () => {
  const ploeg = (kiesploegId = 'delta') => expense({ groupId: null, kiesploegId });

  it('laat een lid van de ploeg indienen zonder enig recht, maar geeft geen overzicht', () => {
    const lid = accessFor(session({}), { ploegen: [{ id: 'delta', name: 'Kiesploeg Delta' }], ploegScope: [] });
    expect(lid.canSubmit).toBe(true);
    expect(lid.canSeeOverview).toBe(false);
    expect(canView(lid, ploeg())).toBe(false);
    expect(visibilityWhere(lid)).toEqual({ submittedById: 'me' });
  });

  it('geeft Beheer van de ploeg haar rekeningen: zien, corrigeren, wissen en terugbetalen', () => {
    const beheer = accessFor(session({}), { ploegen: [], ploegScope: ['delta'] });
    expect(beheer.canSubmit).toBe(true);
    expect(beheer.canSeeOverview).toBe(true);
    expect(canView(beheer, ploeg())).toBe(true);
    expect(canEdit(beheer, ploeg())).toBe(true);
    expect(canDelete(beheer, ploeg())).toBe(true);
    expect(canReimburse(beheer, ploeg())).toBe(true);
    expect(visibilityWhere(beheer)).toEqual({
      OR: [{ kiesploegId: { in: ['delta'] } }, { submittedById: 'me' }],
    });
  });

  it('geeft Beheer van de ploeg niets van een andere ploeg of een gewone post', () => {
    const beheer = accessFor(session({}), { ploegen: [], ploegScope: ['delta'] });
    expect(canView(beheer, ploeg('epsilon'))).toBe(false);
    expect(canView(beheer, expense())).toBe(false);
    expect(canReimburse(beheer, ploeg('epsilon'))).toBe(false);
  });

  it('laat de rekening los zodra Beheer van VTK ze doorstuurde of inboekte', () => {
    const beheer = accessFor(session({}), { ploegen: [], ploegScope: ['delta'] });
    expect(canEdit(beheer, { ...ploeg(), sentAt: at })).toBe(false);
    expect(canDelete(beheer, { ...ploeg(), bookedAt: at })).toBe(false);
    expect(canReimburse(beheer, expense({ groupId: null, kiesploegId: 'delta', paidAt: at, sentAt: at }))).toBe(false);
  });

  it('combineert een eigen post met de ploeg', () => {
    const beide = accessFor(session({ permissions: ['expenses.managePost'], groups: ['cudi'] }), {
      ploegen: [],
      ploegScope: ['delta'],
    });
    expect(visibilityWhere(beide)).toEqual({
      OR: [{ groupId: { in: ['cudi'] } }, { kiesploegId: { in: ['delta'] } }, { submittedById: 'me' }],
    });
  });
});
