'use server';

import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_BASE_PATH } from '@vtk/auth';
import { ensureFlowTestClient, FLOW_TEST_CLIENT_ID } from '@vtk/auth/server';

/**
 * De PKCE-verifier en de state moeten de omleiding overleven zonder dat de
 * browser ze kan vervalsen; een httpOnly-cookie is daarvoor de eenvoudigste
 * plek. Kort houdbaar: dit is een test die je in één keer doorloopt.
 */
const STATE_COOKIE = 'vtk_flow_test';

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** Waar deze omgeving bereikbaar is, zodat de redirect-URI altijd klopt. */
async function origin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function startFlowTestAction(formData: FormData): Promise<void> {
  const scopes = formData.getAll('scopes').map(String);
  const prompt = String(formData.get('prompt') || '');
  const access = String(formData.get('access') || 'open');
  const requestHeaders = await headers();

  const redirectUri = `${await origin()}/admin/sso/test/callback`;
  await ensureFlowTestClient(requestHeaders, redirectUri, {
    accessMode: access === 'open' ? 'OPEN' : 'RESTRICTED',
    // Enkel bij "beperkt, met toegang" ken je jezelf de permissie toe; bij
    // "beperkt, zonder toegang" wordt ze net weggehaald, zodat de poort echt
    // getest wordt en niet een restje van een vorige run.
    grantAccessToSelf: access === 'restricted-granted',
    skipConsent: formData.get('skipConsent') === 'on',
  });

  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const state = base64url(randomBytes(16));

  const jar = await cookies();
  jar.set(STATE_COOKIE, JSON.stringify({ codeVerifier, state, redirectUri }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: redirectUri.startsWith('https://'),
    path: '/',
    maxAge: 600,
  });

  const authorize = new URLSearchParams({
    response_type: 'code',
    client_id: FLOW_TEST_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  if (prompt) authorize.set('prompt', prompt);

  // redirect() werkt via een throw; buiten elke try/catch houden.
  redirect(`${AUTH_BASE_PATH}/oauth2/authorize?${authorize.toString()}`);
}

/** Leest en wist de bewaarde flowstatus; een code is maar één keer bruikbaar. */
export async function takeFlowTestState(): Promise<{
  codeVerifier: string;
  state: string;
  redirectUri: string;
} | null> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
