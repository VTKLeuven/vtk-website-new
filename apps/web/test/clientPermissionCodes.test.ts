import { describe, expect, it } from 'vitest';
import {
  ACCESS_SUFFIX,
  CLAIMS,
  MAX_PERMISSIONS_PER_CLIENT,
  RESERVED_NAMESPACES,
  accessCodeFor,
  checkCode,
  checkNamespace,
} from '@vtk/auth';

describe('permission namespaces', () => {
  it('accepts an ordinary namespace', () => {
    expect(checkNamespace('wiki')).toBeNull();
    expect(checkNamespace('cudi')).toBeNull();
    expect(checkNamespace('crm-partner')).toBeNull();
  });

  it('rejects VTK-owned prefixes', () => {
    // Een client die zich `vtk` noemt, geeft codes uit die niet van hem zijn en
    // die naast onze eigen claims komen te staan.
    for (const reserved of RESERVED_NAMESPACES) {
      expect(checkNamespace(reserved), reserved).toBe('NAMESPACE_RESERVED');
    }
  });

  it('rejects shapes that would not survive a token', () => {
    for (const bad of ['', 'A', 'x', 'Wiki', 'wiki.tool', 'wiki_tool', '1wiki', 'wiki ']) {
      expect(checkNamespace(bad), bad).toBe('NAMESPACE_INVALID');
    }
  });
});

describe('permission codes', () => {
  it('accepts codes inside their own namespace', () => {
    expect(checkCode('wiki.read', 'wiki')).toBeNull();
    expect(checkCode('wiki.pages.edit', 'wiki')).toBeNull();
    expect(checkCode('wiki.access', 'wiki')).toBeNull();
  });

  it('refuses a code belonging to another client', () => {
    // Zonder deze regel definieert client A `b.admin`, kent die toe, en leest
    // client B hem als de zijne.
    expect(checkCode('cudi.admin', 'wiki')).toBe('CODE_WRONG_NAMESPACE');
    expect(checkCode('admin', 'wiki')).toBe('CODE_INVALID');
  });

  it('refuses malformed codes', () => {
    for (const bad of ['wiki.', 'wiki..read', 'Wiki.read', 'wiki.READ', 'wiki.a.b.c.d']) {
      expect(checkCode(bad, 'wiki'), bad).not.toBeNull();
    }
  });

  it('caps the code length so a claim cannot become unbounded', () => {
    expect(checkCode(`wiki.${'a'.repeat(70)}`, 'wiki')).toBe('CODE_TOO_LONG');
    expect(MAX_PERMISSIONS_PER_CLIENT).toBe(64);
  });

  it('derives the access code from the namespace', () => {
    expect(accessCodeFor('wiki')).toBe(`wiki.${ACCESS_SUFFIX}`);
    // De toegangspoort in clientAccess.ts vergelijkt hier letterlijk mee.
    expect(checkCode(accessCodeFor('wiki'), 'wiki')).toBeNull();
  });
});

describe('the entitlements claim', () => {
  it('carries only the client-scoped permissions', () => {
    const claim = CLAIMS.find((c) => c.name === 'permissions');
    expect(claim?.scope).toBe('entitlements');
    // Enkel UserInfo: daar is de client bekend (jwt.azp) en wordt de lijst live
    // opgehaald, zodat een ingetrokken permissie meteen weg is.
    expect(claim?.destinations).toEqual(['userinfo']);
  });

  it('still exposes no VTK org structure', () => {
    for (const name of ['vtk:roles', 'vtk:permissions', 'vtk:groups', 'vtk:is_praesidium']) {
      expect(CLAIMS.map((c) => c.name), name).not.toContain(name);
    }
  });
});
