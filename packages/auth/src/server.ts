/**
 * @author Witse Panneels
 * @date 2026-06-19
 *
 * better-auth server components, to be used on central platform / app (@vtk/web)
 * Also includes functions for sso and session validation for remote apps (@vtk/logistiek, ...)
 *
 * If you are working on a remote app, please do not use this file/these components, use ./remote.ts instead!
 *
 * !do not import these into a client component!
 */
import 'server-only';
import { auth } from './auth';

export { hashPassword } from './logins/password';
export { isKulEnabled } from './logins/kul';
export { ApiHandler } from './apiHandlers/apiHandler';
export { getSession } from './server/session';
export { createUser, updateUser, setUserPassword, deleteUser } from './server/users';

export async function signInEmail(
  headers: Headers,
  body: {
    email: string;
    password: string;
  }
) {
  return auth.api.signInEmail({
    headers,
    body,
  });
}

export async function signOut(headers: Headers) {
  return auth.api.signOut({
    headers,
  });
}

/**
 * Verwerkt de keuze van het lid op het toestemmingsscherm. `oauth_query` moet
 * de ondertekende autorisatie-query zijn zoals ze binnenkwam; een ontbrekende
 * ondertekende parameter geeft `invalid_signature`. Geeft de URL terug waar de
 * browser naartoe moet.
 */
export async function oauthConsent(
  headers: Headers,
  body: { accept: boolean; scope?: string; oauth_query: string }
): Promise<{ url: string }> {
  const result = await auth.api.oauth2Consent({ headers, body });

  // De plugin zet zelf `accept: application/json`, dus komt de bestemming als
  // waarde terug in plaats van als een echte 302.
  const url = (result as { redirect?: boolean; url?: string })?.url;
  if (!url) throw new Error('oauth2Consent gaf geen redirect-URL terug');
  return { url };
}
