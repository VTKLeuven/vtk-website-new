import { describe, expect, it } from 'vitest';
import {
  readLimitedFormData,
  readLimitedJson,
  RequestBodyTooLargeError,
  trustedClientIp,
} from '@/lib/ticketing/http';

describe('ticket checkout HTTP limits', () => {
  it('rejects oversized request bodies even without content-length', async () => {
    const request = new Request('https://vtk.be/api/tickets/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(200) }),
    });
    await expect(readLimitedJson(request, 100)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('ignores spoofable x-real-ip and uses the last proxy-owned forwarded hop', () => {
    expect(
      trustedClientIp(
        new Request('https://vtk.be', {
          headers: { 'x-real-ip': '203.0.113.8', 'x-forwarded-for': 'spoofed, 10.0.0.2' },
        })
      )
    ).toBe('10.0.0.2');
    expect(
      trustedClientIp(
        new Request('https://vtk.be', {
          headers: { 'x-forwarded-for': 'spoofed, 10.0.0.2' },
        })
      )
    ).toBe('10.0.0.2');
  });

  it('rejects oversized multipart bodies before parsing form data', async () => {
    const form = new FormData();
    form.set('file', new File(['x'.repeat(200)], 'large.txt'));
    const request = new Request('https://vtk.be/api/upload', {
      method: 'POST',
      headers: { 'content-length': '200' },
      body: form,
    });
    await expect(readLimitedFormData(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
