/**
 * @author Witse Panneels
 * @date 2026-06-25
 *
 * client safe auth components
 */
'use client';

import { createAuthClient } from 'better-auth/react';
import { genericOAuthClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: '/api/auth/better',
  plugins: [genericOAuthClient()],
});

export const { signIn, signOut, useSession } = authClient;

/** KU Leuven OIDC provider id (must match the server config in logins/kul.ts). */
export const KUL_PROVIDER_ID = 'kuleuven';

/**
 * Start the KU Leuven SSO flow: redirects to KU Leuven, then back to `next`.
 * On failure the user is returned to the login page. Better Auth appends its
 * machine-readable `error` parameter; `source=kul` lets the page distinguish
 * this from an email/password error without masking that parameter.
 */
export async function signInKul(next = '/'): Promise<void> {
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  await authClient.signIn.oauth2({
    providerId: KUL_PROVIDER_ID,
    callbackURL: safeNext,
    errorCallbackURL: '/inloggen?source=kul',
  });
}
