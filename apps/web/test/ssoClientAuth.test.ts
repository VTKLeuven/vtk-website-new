import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  return {
    findUnique: vi.fn(),
  };
});

vi.mock('@vtk/db', () => ({
  prisma: {
    oauthClient: { findUnique: mocks.findUnique },
  },
}));

import { normalizeOAuthClientAuth } from '../../../packages/auth/src/apiHandlers/apiHandler';

describe('normalizeOAuthClientAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normaliseert client_secret_post naar client_secret_basic voor een client met standaard auth-methode (null)', async () => {
    mocks.findUnique.mockResolvedValue({ tokenEndpointAuthMethod: null });

    const req = new NextRequest('http://localhost:3000/api/auth/better/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=authorization_code&code=xyz&client_id=burgieclan&client_secret=secret123&redirect_uri=https%3A%2F%2Fburgieclan.vtk.be%2Fcallback',
    });

    const normalized = await normalizeOAuthClientAuth(req);

    // Authorization header moet Basic base64(burgieclan:secret123) zijn
    const authHeader = normalized.headers.get('authorization');
    expect(authHeader).toBe(`Basic ${Buffer.from('burgieclan:secret123').toString('base64')}`);

    // client_secret moet uit de body verwijderd zijn om "must use only one client authentication method" te voorkomen
    const bodyText = await normalized.text();
    const params = new URLSearchParams(bodyText);
    expect(params.get('client_secret')).toBeNull();
    expect(params.get('client_id')).toBe('burgieclan');
    expect(params.get('code')).toBe('xyz');
    expect(params.get('grant_type')).toBe('authorization_code');
  });

  it('normaliseert client_secret_post naar client_secret_basic voor JSON bodies', async () => {
    mocks.findUnique.mockResolvedValue({ tokenEndpointAuthMethod: 'client_secret_basic' });

    const req = new NextRequest('http://localhost:3000/api/auth/better/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: 'my-app',
        client_secret: 'topsecret',
      }),
    });

    const normalized = await normalizeOAuthClientAuth(req);

    expect(normalized.headers.get('authorization')).toBe(`Basic ${Buffer.from('my-app:topsecret').toString('base64')}`);
    const json = JSON.parse(await normalized.text());
    expect(json.client_secret).toBeUndefined();
    expect(json.client_id).toBe('my-app');
  });

  it('behoudt client_secret_post wanneer de client geregistreerd staat voor client_secret_post', async () => {
    mocks.findUnique.mockResolvedValue({ tokenEndpointAuthMethod: 'client_secret_post' });

    const req = new NextRequest('http://localhost:3000/api/auth/better/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=authorization_code&client_id=post-client&client_secret=secret',
    });

    const normalized = await normalizeOAuthClientAuth(req);

    expect(normalized.headers.get('authorization')).toBeNull();
    const bodyText = await normalized.text();
    expect(new URLSearchParams(bodyText).get('client_secret')).toBe('secret');
  });

  it('normaliseert client_secret_basic naar body wanneer de client geregistreerd staat voor client_secret_post', async () => {
    mocks.findUnique.mockResolvedValue({ tokenEndpointAuthMethod: 'client_secret_post' });

    const req = new NextRequest('http://localhost:3000/api/auth/better/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from('post-client:mysecret').toString('base64')}`,
      },
      body: 'grant_type=authorization_code&code=abc',
    });

    const normalized = await normalizeOAuthClientAuth(req);

    expect(normalized.headers.get('authorization')).toBeNull();
    const params = new URLSearchParams(await normalized.text());
    expect(params.get('client_id')).toBe('post-client');
    expect(params.get('client_secret')).toBe('mysecret');
    expect(params.get('code')).toBe('abc');
  });

  it('laat publieke clients zonder client_secret ongemoeid', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/better/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=authorization_code&code=abc&client_id=public-app&code_verifier=xyz',
    });

    const normalized = await normalizeOAuthClientAuth(req);

    expect(normalized.headers.get('authorization')).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    const params = new URLSearchParams(await normalized.text());
    expect(params.get('client_secret')).toBeNull();
    expect(params.get('code_verifier')).toBe('xyz');
  });

  it('laat niet-OAuth endpoints volledig ongemoeid', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/better/sign-in/social', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider: 'kuleuven' }),
    });

    const normalized = await normalizeOAuthClientAuth(req);

    expect(normalized).toBe(req);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
