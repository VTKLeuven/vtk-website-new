import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSafeRedirectUrl, sanitizeNextUrl } from '@vtk/auth';

afterEach(() => vi.unstubAllEnvs());

describe('isSafeRedirectUrl', () => {
  it('accepts valid relative paths', () => {
    expect(isSafeRedirectUrl('/materiaal')).toBe(true);
    expect(isSafeRedirectUrl('/admin/tickets?page=2')).toBe(true);
    expect(isSafeRedirectUrl('/nl/inloggen')).toBe(true);
    expect(isSafeRedirectUrl('/')).toBe(true);
  });

  it('rejects protocol-relative and backslash paths', () => {
    expect(isSafeRedirectUrl('//evil.com')).toBe(false);
    expect(isSafeRedirectUrl('//vtk.be')).toBe(false);
    expect(isSafeRedirectUrl('/\\evil.com')).toBe(false);
    expect(isSafeRedirectUrl('\\evil.com')).toBe(false);
  });

  it('accepts HTTPS URLs on trusted VTK domains', () => {
    expect(isSafeRedirectUrl('https://vtk.be')).toBe(true);
    expect(isSafeRedirectUrl('https://vtk.be/account')).toBe(true);
    expect(isSafeRedirectUrl('https://dev.vtk.be')).toBe(true);
    expect(isSafeRedirectUrl('https://logistiek.dev.vtk.be')).toBe(true);
    expect(isSafeRedirectUrl('https://logistiek.dev.vtk.be/beheer')).toBe(true);
    expect(isSafeRedirectUrl('https://elixir.dev.vtk.be/admin')).toBe(true);
    expect(isSafeRedirectUrl('https://logistiek.vtk.be/materiaal/123')).toBe(true);
  });

  it('rejects non-HTTPS URLs on production domains', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isSafeRedirectUrl('http://vtk.be')).toBe(false);
    expect(isSafeRedirectUrl('http://dev.vtk.be')).toBe(false);
    expect(isSafeRedirectUrl('http://logistiek.dev.vtk.be')).toBe(false);
  });

  it('rejects attacker-crafted lookalike domains', () => {
    expect(isSafeRedirectUrl('https://attacker.com')).toBe(false);
    expect(isSafeRedirectUrl('https://vtk.be.evil.com')).toBe(false);
    expect(isSafeRedirectUrl('https://notvtk.be')).toBe(false);
    expect(isSafeRedirectUrl('https://evil-vtk.be')).toBe(false);
    expect(isSafeRedirectUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirectUrl('data:text/html,test')).toBe(false);
  });

  it('accepts localhost in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isSafeRedirectUrl('http://localhost:3000')).toBe(true);
    expect(isSafeRedirectUrl('http://localhost:3100/materiaal')).toBe(true);
    expect(isSafeRedirectUrl('http://app.localhost:3000')).toBe(true);
  });

  it('handles null, undefined, and empty strings safely', () => {
    expect(isSafeRedirectUrl(null)).toBe(false);
    expect(isSafeRedirectUrl(undefined)).toBe(false);
    expect(isSafeRedirectUrl('')).toBe(false);
    expect(isSafeRedirectUrl('   ')).toBe(false);
  });
});

describe('sanitizeNextUrl', () => {
  it('returns valid URLs unchanged', () => {
    expect(sanitizeNextUrl('/materiaal')).toBe('/materiaal');
    expect(sanitizeNextUrl('https://logistiek.dev.vtk.be/beheer')).toBe(
      'https://logistiek.dev.vtk.be/beheer'
    );
  });

  it('returns fallback for invalid URLs', () => {
    expect(sanitizeNextUrl('https://evil.com')).toBe('/');
    expect(sanitizeNextUrl('//evil.com', '/fallback')).toBe('/fallback');
    expect(sanitizeNextUrl(null, '/fallback')).toBe('/fallback');
    expect(sanitizeNextUrl(undefined)).toBe('/');
  });
});
