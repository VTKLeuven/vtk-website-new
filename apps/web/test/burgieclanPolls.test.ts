import { describe, expect, it } from 'vitest';
import {
  burgieclanAuthHeaders,
  decodeIdentity,
  encodeIdentity,
  signBurgieclanRequest,
  verifyBurgieclanRequest,
} from '@/lib/burgieclan/signature';

/**
 * De peilingen op Burgieclan: daar tekent Burgieclan en kijkt vtk.be na
 * (`app/api/burgieclan/v1/polls`).
 *
 * De vector hieronder staat letterlijk ook in `VtkPollsTest` bij Burgieclan
 * (`testSignatureMatchesTheVtkWebsite`): wijzigt het schema aan één kant, dan
 * faalt een van de twee in plaats van dat Burgieclan stil geen peilingen toont.
 */
describe('burgieclan-peilingen', () => {
  const secret = 'x'.repeat(40);
  const identity = { sub: 'u1', email: 'r0@kuleuven.be', name: 'Ada Lövelace' };
  const now = 1_700_000_000_000;
  const path = '/api/burgieclan/v1/polls';
  const body = '{"pollId":"p1","answers":{"q1":"1"}}';

  function headersOf(record: Record<string, string>) {
    return new Headers(record);
  }

  it('kijkt na wat Burgieclan tekent', () => {
    expect(
      signBurgieclanRequest({ secret, method: 'POST', path, timestamp: 1700000000, user: encodeIdentity(identity), body }),
    ).toBe('sha256=82b996ba1a98ffbcbfe69324367b74bbacef0f54a88127730d9d38c97a901308');

    const headers = headersOf(burgieclanAuthHeaders({ secret, method: 'POST', path, body, identity, now }));
    expect(verifyBurgieclanRequest({ secret, method: 'POST', path, body, headers, now })).toEqual(identity);
  });

  it('weigert een ander pad, een andere body, een ander geheim of een oude aanvraag', () => {
    const headers = headersOf(burgieclanAuthHeaders({ secret, method: 'POST', path, body, identity, now }));
    const check = (overrides: Partial<{ secret: string; method: string; path: string; body: string; now: number }>) =>
      verifyBurgieclanRequest({ secret, method: 'POST', path, body, headers, now, ...overrides });

    expect(check({ path: '/api/burgieclan/v1/events' })).toBeNull();
    expect(check({ body: '{"pollId":"p2","answers":{"q1":"1"}}' })).toBeNull();
    expect(check({ method: 'GET' })).toBeNull();
    expect(check({ secret: 'y'.repeat(40) })).toBeNull();
    expect(check({ now: now + 301_000 })).toBeNull();
    expect(check({ now: now + 299_000 })).toEqual(identity);
  });

  it('weigert een andere gebruiker onder dezelfde handtekening', () => {
    const signed = burgieclanAuthHeaders({ secret, method: 'GET', path, body: '', identity, now });
    const swapped = headersOf({ ...signed, 'X-Vtk-User': encodeIdentity({ ...identity, sub: 'u2' }) });
    expect(verifyBurgieclanRequest({ secret, method: 'GET', path, body: '', headers: swapped, now })).toBeNull();
    expect(verifyBurgieclanRequest({ secret, method: 'GET', path, body: '', headers: new Headers(), now })).toBeNull();
  });

  it('leest enkel een volledige identiteit', () => {
    expect(decodeIdentity(encodeIdentity(identity))).toEqual(identity);
    expect(decodeIdentity(encodeIdentity({ sub: 'u1', email: 'a@kuleuven.be', name: '' }))?.name).toBe('a@kuleuven.be');
    expect(decodeIdentity(Buffer.from('{"sub":"","email":"a@b"}').toString('base64url'))).toBeNull();
    expect(decodeIdentity('niet-base64-json')).toBeNull();
  });
});
