import { describe, expect, it } from 'vitest';
import type { OauthClient } from '@prisma/client';
import { attentionFor } from '@/app/[locale]/admin/sso/attention';
import { checkRedirectUris } from '@/app/[locale]/admin/sso/redirectUris';
import { SCOPES, SCOPE_CODES, DEFAULT_SCOPE_CODES, isSensitiveScope, describeScope } from '@vtk/auth';

/** Minimale client; elke test zet enkel wat ze onderzoekt. */
function client(overrides: Partial<OauthClient> = {}): OauthClient {
  return {
    id: 'c1',
    clientId: 'c1',
    clientSecret: 'secret',
    disabled: false,
    skipConsent: false,
    enableEndSession: null,
    subjectType: null,
    scopes: ['openid'],
    userId: null,
    referenceId: 'vtk',
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Test app',
    uri: null,
    icon: null,
    contacts: ['it@vtk.be'],
    tos: null,
    policy: null,
    softwareId: null,
    softwareVersion: null,
    softwareStatement: null,
    redirectUris: ['https://app.vtk.be/callback'],
    ...overrides,
  } as OauthClient;
}

describe('redirect URI rules', () => {
  it('accepts https anywhere and http on loopback only', () => {
    expect(checkRedirectUris(['https://app.vtk.be/cb'])).toBeNull();
    expect(checkRedirectUris(['http://localhost:3000/cb'])).toBeNull();
    expect(checkRedirectUris(['http://127.0.0.1:9999/cb'])).toBeNull();
    expect(checkRedirectUris(['http://app.localhost/cb'])).toBeNull();
  });

  it('rejects plaintext http on a real host, which would leak authorization codes', () => {
    expect(checkRedirectUris(['http://partner.example/cb'])?.code).toBe('NOT_HTTPS');
  });

  it('rejects a fragment, per RFC 6749 3.1.2', () => {
    expect(checkRedirectUris(['https://app.vtk.be/cb#frag'])?.code).toBe('FRAGMENT');
  });

  it('rejects anything that is not a URL', () => {
    expect(checkRedirectUris(['not-a-url'])?.code).toBe('INVALID_URL');
  });

  it('reports the first offending URI, not just that something was wrong', () => {
    const problem = checkRedirectUris(['https://ok.vtk.be/cb', 'http://bad.example/cb']);
    expect(problem).toEqual({ code: 'NOT_HTTPS', uri: 'http://bad.example/cb' });
  });
});

describe('client attention rules', () => {
  it('stays silent on a healthy VTK client', () => {
    expect(attentionFor(client())).toEqual([]);
  });

  it('flags http redirect URIs outside loopback', () => {
    const codes = attentionFor(client({ redirectUris: ['http://partner.example/cb'] })).map((a) => a.code);
    expect(codes).toContain('insecure-redirect');
  });

  it('does not flag skipConsent for an app running entirely on vtk.be', () => {
    const codes = attentionFor(client({ skipConsent: true, redirectUris: ['https://logistiek.vtk.be/cb'] })).map(
      (a) => a.code
    );
    expect(codes).not.toContain('skip-consent');
  });

  it('flags skipConsent as soon as one redirect URI leaves vtk.be', () => {
    const codes = attentionFor(
      client({ skipConsent: true, redirectUris: ['https://logistiek.vtk.be/cb', 'https://partner.example/cb'] })
    ).map((a) => a.code);
    expect(codes).toContain('skip-consent');
  });

  it('does not treat a lookalike domain as VTK-owned', () => {
    const codes = attentionFor(client({ skipConsent: true, redirectUris: ['https://nietvtk.be/cb'] })).map(
      (a) => a.code
    );
    expect(codes).toContain('skip-consent');
  });

  it('flags a client nobody can be contacted about', () => {
    expect(attentionFor(client({ contacts: [] })).map((a) => a.code)).toContain('no-contacts');
  });

  it('flags a disabled client', () => {
    expect(attentionFor(client({ disabled: true })).map((a) => a.code)).toContain('disabled');
  });
});

describe('scope registry', () => {
  it('has unique codes', () => {
    expect(new Set(SCOPE_CODES).size).toBe(SCOPE_CODES.length);
  });

  it('only pre-selects scopes that exist', () => {
    for (const code of DEFAULT_SCOPE_CODES) expect(SCOPE_CODES).toContain(code);
  });

  it('always offers openid, since without it there is no OIDC login', () => {
    expect(SCOPE_CODES).toContain('openid');
  });

  it('keeps the student number separate from programme and year', () => {
    // Zo hoeft een app die enkel de richting nodig heeft niet ook het
    // studentennummer te kunnen opvragen.
    expect(SCOPE_CODES).toContain('vtk:study_programme');
    expect(SCOPE_CODES).toContain('vtk:study_year');
    expect(SCOPE_CODES).toContain('vtk:student_number');
    expect(isSensitiveScope('vtk:student_number')).toBe(true);
  });

  it('gives every scope plain-language consent copy in both languages', () => {
    for (const scope of SCOPES) {
      expect(scope.consentNl.length).toBeGreaterThan(0);
      expect(scope.consentEn.length).toBeGreaterThan(0);
      // Geen kale code als omschrijving: het lid moet dit kunnen lezen.
      expect(scope.consentNl).not.toBe(scope.code);
      expect(scope.consentEn).not.toBe(scope.code);
    }
  });

  it('falls back to the raw code for an unknown scope rather than showing nothing', () => {
    expect(describeScope('iets:onbekends', 'nl')).toBe('iets:onbekends');
    expect(isSensitiveScope('iets:onbekends')).toBe(false);
  });
});
