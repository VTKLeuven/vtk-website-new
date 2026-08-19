import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessToken, readAccessToken } from '@/lib/urenloopApp/access';
import { isPlatformId, updateKey } from '@/lib/urenloopApp/config';
import { bearerFrom } from '@/lib/urenloopApp/devices';

afterEach(() => vi.unstubAllEnvs());

describe('24UL download access token', () => {
  it('round-trips the address it was made for', () => {
    expect(readAccessToken(createAccessToken('it@kring.be'))).toBe('it@kring.be');
  });

  it('refuses a token whose payload was edited', () => {
    const token = createAccessToken('it@kring.be');
    const [prefix, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ email: 'rivaal@kring.be', exp: Date.now() + 60_000 }),
      'utf8',
    ).toString('base64url');
    expect(readAccessToken(`${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it('refuses a token that has expired', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-19T10:00:00Z'));
      const token = createAccessToken('it@kring.be');
      // De cookie is een dag geldig; een dag en een minuut later niet meer.
      vi.setSystemTime(new Date('2026-08-20T10:01:00Z'));
      expect(readAccessToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses nonsense rather than throwing', () => {
    expect(readAccessToken(undefined)).toBeNull();
    expect(readAccessToken('')).toBeNull();
    expect(readAccessToken('not-a-token')).toBeNull();
    expect(readAccessToken('vtk24ul1.@@@.@@@')).toBeNull();
  });
});

describe('24UL update feed', () => {
  it('serves only the three files the updater needs', () => {
    expect(updateKey('latest.yml')).toBe('24ul-app/latest.yml');
    expect(updateKey('24urenloop-Setup.exe')).toBe('24ul-app/24urenloop-Setup.exe');
    expect(updateKey('24urenloop-Setup.exe.blockmap')).toBe('24ul-app/24urenloop-Setup.exe.blockmap');
  });

  it('does not hand out the downloads the email gate exists for', () => {
    expect(updateKey('24urenloop-Mac.dmg')).toBeNull();
    expect(updateKey('24urenloop-Linux.deb')).toBeNull();
    expect(updateKey('release.json')).toBeNull();
    expect(updateKey('../../etc/passwd')).toBeNull();
  });
});

describe('24UL platform ids', () => {
  it('accepts only the three built platforms', () => {
    expect(isPlatformId('windows')).toBe(true);
    expect(isPlatformId('mac')).toBe(true);
    expect(isPlatformId('linux')).toBe(true);
    expect(isPlatformId('release.json')).toBe(false);
    expect(isPlatformId('')).toBe(false);
  });
});

describe('24UL device token header', () => {
  it('reads a bearer token, case-insensitively', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('  Bearer   abc123  ')).toBe('abc123');
  });

  it('refuses anything that is not one bearer token', () => {
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom('')).toBeNull();
    expect(bearerFrom('abc123')).toBeNull();
    expect(bearerFrom('Basic abc123')).toBeNull();
    expect(bearerFrom('Bearer')).toBeNull();
    expect(bearerFrom('Bearer a b')).toBeNull();
  });
});
