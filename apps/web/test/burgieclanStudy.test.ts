import { describe, expect, it } from 'vitest';
import {
  burgieclanAuthHeaders,
  encodeIdentity,
  signBurgieclanRequest,
  verifyBurgieclanRequest,
} from '@/lib/burgieclan/signature';

/**
 * De studietimer op Burgieclan: daar tekent Burgieclan en kijkt vtk.be na
 * (`app/api/burgieclan/v1/studeren`).
 *
 * De vector hieronder staat letterlijk ook in `VtkStudyTest` bij Burgieclan
 * (`testSignatureMatchesTheVtkWebsite`): wijzigt het schema aan één kant, dan
 * faalt een van de twee in plaats van dat de timer stil terugvalt op Burgieclan.
 */
describe('burgieclan-studietimer', () => {
  const secret = 'x'.repeat(40);
  const identity = { sub: 'u1', email: 'r0@kuleuven.be', name: 'Ada Lövelace' };
  const now = 1_700_000_000_000;
  const path = '/api/burgieclan/v1/studeren';
  const body = '{"action":"start"}';

  it('kijkt na wat Burgieclan tekent', () => {
    expect(
      signBurgieclanRequest({ secret, method: 'POST', path, timestamp: 1700000000, user: encodeIdentity(identity), body }),
    ).toBe('sha256=84f008d04b5d0cd9c0fb858c0865957fe23a9633a0d04b05a7d5000eda30c07f');

    const headers = new Headers(burgieclanAuthHeaders({ secret, method: 'POST', path, body, identity, now }));
    expect(verifyBurgieclanRequest({ secret, method: 'POST', path, body, headers, now })).toEqual(identity);
  });

  it('een handtekening voor de peilingen opent de timer niet', () => {
    const headers = new Headers(
      burgieclanAuthHeaders({ secret, method: 'POST', path: '/api/burgieclan/v1/polls', body, identity, now }),
    );
    expect(verifyBurgieclanRequest({ secret, method: 'POST', path, body, headers, now })).toBeNull();
  });

  it('een andere actie onder dezelfde handtekening telt niet', () => {
    const headers = new Headers(burgieclanAuthHeaders({ secret, method: 'POST', path, body, identity, now }));
    expect(verifyBurgieclanRequest({ secret, method: 'POST', path, body: '{"action":"stop"}', headers, now })).toBeNull();
  });
});
