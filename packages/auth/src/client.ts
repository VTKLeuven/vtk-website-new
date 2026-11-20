/**
 * @author Witse Panneels
 * @date 2026-06-25
 *
 * client safe auth components
 */
'use client';

import { createAuthClient } from 'better-auth/react';
import { sanitizeNextUrl } from './redirect';

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: '/api/auth/better',
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
/**
 * Een tweede KU Leuven-login aan het huidige account hangen (r- en u-nummer).
 *
 * `prompt=login` laat KU Leuven opnieuw om een login vragen. Zonder die vraag
 * stuurt de IdP meteen de sessie terug waarmee het lid net inlogde, en dan
 * "koppelt" hij dezelfde login nog eens. `voor` geeft het aantal logins van
 * vóór de koppeling mee, zodat /account kan zeggen of er echt één bijkwam.
 */
export async function linkKul(returnPath: string, loginsBefore: number): Promise<void> {
  const safePath = sanitizeNextUrl(returnPath);
  await authClient.linkSocial({
    provider: KUL_PROVIDER_ID,
    callbackURL: `${safePath}?kul=gekoppeld&voor=${loginsBefore}#kul`,
    errorCallbackURL: `${safePath}?kul=fout#kul`,
    additionalParams: { prompt: 'login' },
  });
}

export async function signInKul(next = '/'): Promise<void> {
  const safeNext = sanitizeNextUrl(next);
  await authClient.signIn.social({
    provider: KUL_PROVIDER_ID,
    callbackURL: safeNext,
    errorCallbackURL: '/inloggen?source=kul',
  });
}
