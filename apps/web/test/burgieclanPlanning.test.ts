import { describe, expect, it } from 'vitest';
import { appPlanningOperationSchema } from '@/lib/app-api/schemas';
import { burgieclanAuthHeaders, encodeIdentity, signBurgieclanRequest } from '@/lib/burgieclan/signature';

/**
 * De koppeling met de planning van Burgieclan (`docs/burgieclan-planning.md`).
 *
 * De vector hieronder staat letterlijk ook in `StudyPlannerVtkTest` bij
 * Burgieclan (`testSignatureMatchesTheVtkWebsite`): wijzigt het schema aan één
 * kant, dan faalt een van de twee in plaats van dat de app stil 401's krijgt.
 */
describe('burgieclan-planning', () => {
  const user = encodeIdentity({ sub: 'u1', email: 'r0@kuleuven.be', name: 'Ada Lövelace' });

  it('tekent zoals Burgieclan nakijkt', () => {
    expect(user).toBe('eyJzdWIiOiJ1MSIsImVtYWlsIjoicjBAa3VsZXV2ZW4uYmUiLCJuYW1lIjoiQWRhIEzDtnZlbGFjZSJ9');
    expect(
      signBurgieclanRequest({
        secret: 'x'.repeat(40),
        method: 'post',
        path: '/api/study_planner/operations',
        timestamp: 1700000000,
        user,
        body: '{"op":"done"}',
      }),
    ).toBe('sha256=9b2dc7d92f29cf5c514af09feeb4b7d7f22e8e082e7246896ae71c58f2c29010');
  });

  it('bindt pad, gebruiker en body aan de handtekening', () => {
    const base = {
      secret: 'x'.repeat(40),
      method: 'POST',
      path: '/api/study_planner/operations',
      body: '{}',
      identity: { sub: 'u1', email: 'a@kuleuven.be', name: 'A' },
      now: 1_700_000_000_000,
    };
    const signature = burgieclanAuthHeaders(base)['X-Vtk-Signature'];
    expect(burgieclanAuthHeaders({ ...base, path: '/api/study_planner' })['X-Vtk-Signature']).not.toBe(signature);
    expect(burgieclanAuthHeaders({ ...base, body: '{"op":"x"}' })['X-Vtk-Signature']).not.toBe(signature);
    expect(
      burgieclanAuthHeaders({ ...base, identity: { ...base.identity, sub: 'u2' } })['X-Vtk-Signature'],
    ).not.toBe(signature);
    expect(burgieclanAuthHeaders(base)['X-Vtk-Timestamp']).toBe('1700000000');
  });

  it('laat enkel de operaties van Burgieclan door', () => {
    expect(appPlanningOperationSchema.parse({ op: 'done', uid: 'l1@timeedit.com', value: true }).op).toBe('done');
    expect(appPlanningOperationSchema.parse({ op: 'addVtkEvent', vtkEventId: 'ckx1' }).op).toBe('addVtkEvent');
    expect(() => appPlanningOperationSchema.parse({ op: 'done', uid: 'x' })).toThrow();
    expect(() => appPlanningOperationSchema.parse({ op: 'deleteEverything' })).toThrow();
    expect(() =>
      appPlanningOperationSchema.parse({
        op: 'addItem',
        item: { subject: 's', kind: 'deadline', title: 't', date: '2026-11-31x', time: null, end: null, note: '' },
      }),
    ).toThrow();
  });
});
