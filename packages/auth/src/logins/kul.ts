/**
 * KU Leuven SSO via OpenID Connect (OIDC).
 *
 * KU Leuven runs a Shibboleth OIDC OP at https://idp.kuleuven.be, which speaks
 * OIDC natively. We register this as a better-auth `genericOAuth` provider and
 * let better-auth handle the authorization-code + PKCE flow. A custom
 * `getUserInfo` always calls KU Leuven's userinfo endpoint because better-auth's
 * default skips it when the ID token already has `sub` and `email`; KU Leuven
 * can release client-specific attributes such as eduPersonOrgUnitDN only from
 * userinfo. ICTS onboards the client under the Authorization Code Flow with a
 * confidential (server-side) client secret; better-auth keeps that secret on
 * the backend and authenticates the token request with `client_secret_post`.
 *
 * Configuration comes entirely from env vars so the ICTS-provided client
 * credentials can be dropped in without code changes. When the required vars are
 * absent the provider is simply not registered (see `auth.ts`), so the app keeps
 * working with email/password only.
 *
 * Required env:
 *   KUL_OIDC_DISCOVERY_URL  https://idp.kuleuven.be/.well-known/openid-configuration
 *   KUL_OIDC_CLIENT_ID      the client_id / Entity ID ICTS registered (e.g. dev.vtk.be)
 *   KUL_OIDC_CLIENT_SECRET  delivered by ICTS in a separate mail; backend-only
 * Optional env:
 *   KUL_OIDC_REDIRECT_URI   override the default callback URL (handy in prod)
 *
 * Default callback URL (register this redirect URI with ICTS):
 *   <BETTER_AUTH_URL>/api/auth/better/oauth2/callback/kuleuven
 */

import { recordKulProfile } from "./kul-debug";
import { firwStudentFromProfile, syncFirwStudent } from "./kul-firw";
import { getKulUserInfo, wasKulUserInfoFetched } from "./kul-userinfo";

export const KUL_PROVIDER_ID = "kuleuven";

// KU Leuven releases claims under SAML-style names (displayName, givenName,
// surname). We also accept the standard OIDC spellings (name, given_name,
// family_name) so the mapping keeps working if KU Leuven ever changes them.
// The index signature lets us also read claims we don't name explicitly (uid,
// sub, ...) when scanning for the r-number.
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
  [claim: string]: unknown;
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

/**
 * KU Leuven student number (r-number), or `undefined` for staff (u-numbers) and
 * anyone without one.
 *
 * KU Leuven's `uid` attribute is the account name, which for students is `r`
 * followed by exactly 7 digits, and ICTS releases it as an OIDC claim (usually
 * `preferred_username`, sometimes `uid`). Rather than hard-code the claim name,
 * we scan every string claim for that distinctive shape, so the mapping keeps
 * working whichever claim carries it (and even picks it up from an
 * r-number-based email). Returned lower-case to match the onboarding format.
 */
function profileRNumber(profile: ProfileLike): string | undefined {
  for (const value of Object.values(profile)) {
    if (typeof value !== "string") continue;
    const match = value.match(/\br\d{7}\b/i);
    if (match) return match[0].toLowerCase();
  }
  return undefined;
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
    // KU Leuven's own OIDC test client requests `allattributes` in addition to
    // the standard scopes. It is not advertised in discovery, but it is the
    // scope that makes the client-specific ICTS attribute release available.
    scopes: ["openid", "profile", "email", "allattributes"],
    // The default generic-oauth implementation returns the ID-token claims
    // immediately when `sub` and `email` are present. Always fetch userinfo so
    // ICTS-released attributes (eduPersonOrgUnitDN, KULdipl, KULopl, ...) reach
    // mapProfileToUser and the opt-in admin debug log.
    getUserInfo: getKulUserInfo,
    pkce: true,
    // ICTS registered the client with token_endpoint_auth_method
    // `client_secret_post`, so send the secret in the token request body. This
    // is also better-auth's default; we pin it so a future default change or a
    // provider re-registration cannot silently switch us to HTTP basic auth.
    authentication: "post" as const,
    // KU Leuven is authoritative for identity. Map to the fields better-auth
    // uses to locate/link an existing User. The email drives account linking
    // (see `accountLinking.trustedProviders` in auth.ts), so it must match the
    // pre-provisioned User.email. `rNumber` is stored so the onboarding form is
    // pre-filled; it only persists on first login (user creation), which is when
    // onboarding runs, so no override of later edits is needed. `rNumberFromKul`
    // marks it as authoritative so the form renders it read-only (like the
    // e-mail); a member who typed their own r-number keeps it editable. Both
    // require an additionalField in auth.ts (better-auth drops profile fields
    // that aren't declared there).
    mapProfileToUser: async (profile: ProfileLike) => {
      const email = profileEmail(profile);
      const rNumber = profileRNumber(profile);
      const hasUserInfo = wasKulUserInfoFetched(profile);
      const firwStudent = hasUserInfo ? firwStudentFromProfile(profile) : undefined;
      const firwStudentChangedAt = firwStudent === undefined ? undefined : new Date();

      // Bestaande accounts worden bij elke geslaagde KU Leuven-userinfo-call
      // atomair bijgewerkt. De WHERE-clausule schrijft alleen bij een echte
      // statuswijziging of bij de eerste controle van een bestaand account.
      if (email && firwStudent !== undefined && firwStudentChangedAt) {
        await syncFirwStudent(email, firwStudent, firwStudentChangedAt);
      }

      // Opt-in debuglog (Admin -> IT): bewaart de ruwe claims zodat een superadmin
      // ziet welke attributen ICTS vrijgeeft. Doet niets als de toggle uit staat en
      // gooit nooit, dus deze await kan de login niet breken.
      await recordKulProfile(profile, { email, rNumber });
      return {
        email,
        name: profileName(profile),
        emailVerified: true,
        ...(rNumber ? { rNumber, rNumberFromKul: true } : {}),
        ...(firwStudent !== undefined && firwStudentChangedAt
          ? { firwStudent, firwStudentChangedAt }
          : {}),
      };
    },
  };
}
