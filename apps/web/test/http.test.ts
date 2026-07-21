import { describe, expect, it } from 'vitest';
import { readLimitedJson, RequestBodyTooLargeError, trustedClientIp } from '@/lib/ticketing/http';

describe('ticket checkout HTTP limits', () => {
  it('rejects oversized request bodies even without content-length', async () => {
    const request = new Request('https://vtk.be/api/tickets/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(200) }),
    });
    await expect(readLimitedJson(request, 100)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('uses the proxy-owned real IP and otherwise the last forwarded hop', () => {
    expect(
      trustedClientIp(
        new Request('https://vtk.be', {
          headers: { 'x-real-ip': '203.0.113.8', 'x-forwarded-for': 'spoofed, 10.0.0.2' },
        })
      )
    ).toBe('203.0.113.8');
    expect(
      trustedClientIp(
        new Request('https://vtk.be', {
          headers: { 'x-forwarded-for': 'spoofed, 10.0.0.2' },
        })
      )
    ).toBe('10.0.0.2');
  });
});
