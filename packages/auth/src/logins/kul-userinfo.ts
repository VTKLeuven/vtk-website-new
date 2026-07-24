/**
 * KU Leuven puts client-specific attributes such as eduPersonOrgUnitDN on the
 * OIDC userinfo endpoint. better-auth normally skips that endpoint as soon as
 * the ID token already contains `sub` and `email`, so fetch it explicitly and
 * merge both claim sets.
 */
import "server-only";
import type { OAuth2Tokens, OAuth2UserInfo } from "better-auth/oauth2";

export const KUL_USERINFO_URL = "https://idp.kuleuven.be/idp/profile/oidc/userinfo";
const KUL_USERINFO_FETCHED = Symbol("KUL_USERINFO_FETCHED");

type Claims = Record<string, unknown>;
type KulUserInfo = OAuth2UserInfo &
  Claims & {
    [KUL_USERINFO_FETCHED]?: true;
  };

function asClaims(value: unknown): Claims | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Claims)
    : null;
}

function decodeIdToken(idToken: string | undefined): Claims | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    return asClaims(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

function subject(claims: Claims | null): string | number | undefined {
  const value = claims?.sub ?? claims?.id;
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeClaims(claims: Claims | null): KulUserInfo | null {
  const id = subject(claims);
  if (!claims || id === undefined || id === "") return null;

  return {
    ...claims,
    id,
    email: optionalString(claims.email),
    emailVerified: claims.email_verified === true || claims.emailVerified === true,
    name: optionalString(claims.name),
    image: optionalString(claims.picture) ?? optionalString(claims.image),
  };
}

async function fetchUserInfo(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<Claims | null> {
  const response = await fetchImpl(KUL_USERINFO_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return asClaims(await response.json());
}

/**
 * Always asks KU Leuven's userinfo endpoint for the attributes released to our
 * client. A temporary userinfo failure falls back to the ID-token profile so an
 * otherwise valid login keeps working.
 *
 * OIDC requires `sub` in userinfo to equal `sub` in the ID token. A mismatch is
 * rejected instead of merging claims belonging to different identities.
 */
export async function getKulUserInfo(
  tokens: OAuth2Tokens,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<KulUserInfo | null> {
  const idTokenClaims = decodeIdToken(tokens.idToken);
  let userInfoClaims: Claims | null = null;

  if (tokens.accessToken) {
    try {
      userInfoClaims = await fetchUserInfo(tokens.accessToken, fetchImpl);
    } catch {
      // Preserve the existing login behaviour during a transient userinfo error.
    }
  }

  const idTokenSubject = subject(idTokenClaims);
  const userInfoSubject = subject(userInfoClaims);
  if (
    idTokenSubject !== undefined &&
    userInfoSubject !== undefined &&
    String(idTokenSubject) !== String(userInfoSubject)
  ) {
    return null;
  }

  const profile = normalizeClaims(
    idTokenClaims || userInfoClaims
      ? { ...(idTokenClaims ?? {}), ...(userInfoClaims ?? {}) }
      : null,
  );
  if (profile && userInfoClaims) {
    Object.defineProperty(profile, KUL_USERINFO_FETCHED, {
      value: true,
      enumerable: false,
    });
  }
  return profile;
}

/**
 * Whether this profile includes a successful response from KU Leuven userinfo.
 * The marker is deliberately non-enumerable so it never becomes a stored or
 * logged provider claim.
 */
export function wasKulUserInfoFetched(profile: object): boolean {
  return KUL_USERINFO_FETCHED in profile;
}
