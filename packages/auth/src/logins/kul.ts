/**
 * KU Leuven SSO via OpenID Connect (OIDC).
 *
 * KU Leuven federates identity through Microsoft Entra ID, which speaks OIDC
 * natively. We register this as a better-auth `genericOAuth` provider and let
 * better-auth handle the authorization-code + PKCE flow and the userinfo call.
 *
 * Configuration comes entirely from env vars so the ICTS-provided tenant and
 * client credentials can be dropped in without code changes. When the required
 * vars are absent the provider is simply not registered (see `auth.ts`), so the
 * app keeps working with email/password only.
 *
 * Required env:
 *   KUL_OIDC_DISCOVERY_URL  e.g. https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration
 *   KUL_OIDC_CLIENT_ID
 *   KUL_OIDC_CLIENT_SECRET
 * Optional env:
 *   KUL_OIDC_REDIRECT_URI   override the default callback URL (handy in prod)
 *
 * Default callback URL (register this redirect URI with ICTS):
 *   <BETTER_AUTH_URL>/api/auth/better/oauth2/callback/kuleuven
 */

export const KUL_PROVIDER_ID = "kuleuven";

// KU Leuven releases claims under SAML-style names (displayName, givenName,
// surname). We also accept the standard OIDC spellings (name, given_name,
// family_name) so the mapping keeps working if KU Leuven ever changes them.
type ProfileLike = {
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  displayName?: string;
  commonName?: string;
  given_name?: string;
  givenName?: string;
  family_name?: string;
  surname?: string;
};

/** Best-effort email extraction from an OIDC profile, normalized lower-case. */
function profileEmail(profile: ProfileLike): string | undefined {
  const raw = profile.email ?? profile.preferred_username ?? profile.upn;
  return raw ? raw.trim().toLowerCase() : undefined;
}

function profileName(profile: ProfileLike): string {
  const full = profile.name ?? profile.displayName ?? profile.commonName;
  if (full) return full;
  const first = profile.given_name ?? profile.givenName;
  const last = profile.family_name ?? profile.surname;
  const parts = [first, last].filter(Boolean);
  return parts.length ? parts.join(" ") : (profileEmail(profile) ?? "KU Leuven user");
}

/** `true` when all required env vars for KU Leuven OIDC are present. */
export function isKulEnabled(): boolean {
  return Boolean(
    process.env.KUL_OIDC_DISCOVERY_URL &&
      process.env.KUL_OIDC_CLIENT_ID &&
      process.env.KUL_OIDC_CLIENT_SECRET
  );
}

/**
 * Provider config for the better-auth `genericOAuth` plugin, or `null` when the
 * KU Leuven OIDC env vars are not configured.
 */
export function kulOAuthConfig() {
  if (!isKulEnabled()) return null;

  return {
    providerId: KUL_PROVIDER_ID,
    clientId: process.env.KUL_OIDC_CLIENT_ID!,
    clientSecret: process.env.KUL_OIDC_CLIENT_SECRET!,
    discoveryUrl: process.env.KUL_OIDC_DISCOVERY_URL!,
    ...(process.env.KUL_OIDC_REDIRECT_URI
      ? { redirectURI: process.env.KUL_OIDC_REDIRECT_URI }
      : {}),
    scopes: ["openid", "profile", "email"],
    pkce: true,
    // KU Leuven is authoritative for identity. Map to the fields better-auth
    // uses to locate/link an existing User. The email drives account linking
    // (see `accountLinking.trustedProviders` in auth.ts), so it must match the
    // pre-provisioned User.email.
    mapProfileToUser: (profile: ProfileLike) => ({
      email: profileEmail(profile),
      name: profileName(profile),
      emailVerified: true,
    }),
  };
}
