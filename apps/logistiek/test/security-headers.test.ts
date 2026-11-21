import { describe, expect, it, vi } from 'vitest';
import { bearerMatches } from '@/lib/bearer';
import { contentSecurityPolicy } from '@/lib/csp';

/** S7 uit de audit van november 2026: de CSP en de vergelijking van het onderhoudsgeheim. */
describe('contentSecurityPolicy', () => {
  function directives(policy: string): Map<string, string[]> {
    return new Map(
      policy.split('; ').map((directive) => {
        const [name, ...sources] = directive.split(' ');
        return [name!, sources];
      })
    );
  }

  it('sluit vreemde scripts, objecten, base en frames af', () => {
    const policy = directives(contentSecurityPolicy({ development: false, analyticsUrl: null }));
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('script-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get('connect-src')).toEqual(["'self'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('form-action')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'self'"]);
  });

  it('laat de teller van Umami toe, enkel op zijn origin', () => {
    const policy = directives(
      contentSecurityPolicy({ development: false, analyticsUrl: 'https://stats.example.test/umami/' })
    );
    expect(policy.get('script-src')).toContain('https://stats.example.test');
    expect(policy.get('connect-src')).toContain('https://stats.example.test');
    expect(policy.get('script-src')?.some((source) => source.includes('/umami'))).toBe(false);
  });

  it('negeert een URL die geen http(s) is', () => {
    const policy = contentSecurityPolicy({ development: false, analyticsUrl: 'javascript:alert(1)' });
    expect(policy).not.toContain('javascript');
    expect(contentSecurityPolicy({ development: false, analyticsUrl: 'geen url' })).not.toContain('geen');
  });

  it("geeft enkel in dev 'unsafe-eval' en de websocket van de HMR", () => {
    const production = contentSecurityPolicy({ development: false, analyticsUrl: null });
    const development = directives(contentSecurityPolicy({ development: true, analyticsUrl: null }));
    expect(production).not.toContain('unsafe-eval');
    expect(production).not.toContain('ws:');
    expect(development.get('script-src')).toContain("'unsafe-eval'");
    expect(development.get('connect-src')).toEqual(["'self'", 'ws:', 'wss:']);
  });
});

describe('bearerMatches', () => {
  it('aanvaardt enkel exact Bearer met het geheim', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
    expect(bearerMatches('Bearer s3cre', 's3cret')).toBe(false);
    expect(bearerMatches('Bearer s3cretX', 's3cret')).toBe(false);
    expect(bearerMatches('bearer s3cret', 's3cret')).toBe(false);
    expect(bearerMatches('s3cret', 's3cret')).toBe(false);
    expect(bearerMatches('', 's3cret')).toBe(false);
    expect(bearerMatches(null, 's3cret')).toBe(false);
  });
});

describe('de onderhoudsroutes', async () => {
  vi.doMock('@/lib/payments', () => ({
    maintenanceSecret: () => 's3cret',
    reconcilePayments: vi.fn(async () => 0),
  }));
  vi.doMock('@vtk/db', () => ({
    prisma: {
      uitleenPayment: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
    },
  }));
  vi.doMock('@/lib/uitleen-mail', () => ({ sendTeamDigests: vi.fn(async () => ({})) }));
  vi.doMock('@/lib/collectengo/imap', () => ({
    collectEnGoImapConfig: () => null,
    pollCollectEnGoMailbox: vi.fn(),
  }));
  const maintenance = await import('@/app/api/uitleen/maintenance/route');
  const collectengo = await import('@/app/api/uitleen/collectengo/route');

  function post(authorization?: string) {
    return new Request('http://localhost/api', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    });
  }

  it('weigert een fout of ontbrekend geheim met 403', async () => {
    expect((await maintenance.POST(post('Bearer s3cre'))).status).toBe(403);
    expect((await maintenance.POST(post())).status).toBe(403);
    expect((await collectengo.POST(post('Bearer nope'))).status).toBe(403);
  });

  it('laat het juiste geheim door', async () => {
    const response = await maintenance.POST(post('Bearer s3cret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ open: 0, reconciled: 0, expired: 0, digests: {} });
    // Collect&Go zonder IMAP-instelling: voorbij de poort, dan 503.
    expect((await collectengo.POST(post('Bearer s3cret'))).status).toBe(503);
  });
});
