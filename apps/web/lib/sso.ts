/**
 * Single source of truth for the values you register with the KU Leuven
 * Shibboleth tool. Everything that depends on the deployment host is derived
 * from BETTER_AUTH_URL, so the strings are always correct for whatever
 * environment the app is running in (main-dev.vtk.be, production, ...).
 *
 * Note: the Entity ID equals your OIDC client_id, which is a stable identifier
 * and must NOT change between deployments, so it is read from KUL_OIDC_CLIENT_ID
 * (with a sensible default) rather than from the host.
 */

import { KUL_CALLBACK_PATH } from "@vtk/auth";

/** The logo registered in metadata. Lives in apps/web/public. */
export const SSO_LOGO = { path: "/VTK.png", width: 660, height: 777 } as const;

/** Default Entity ID / client_id when KUL_OIDC_CLIENT_ID is not set. */
const DEFAULT_ENTITY_ID = "https://vtk.be";

export type SsoMetadata = {
  base: string;
  entityId: string;
  redirectUri: string;
  infoUrl: string;
  privacyUrl: string;
  logoUrl: string;
  logoWidth: number;
  logoHeight: number;
};

/** Build the Shibboleth registration values from the current environment. */
export function ssoMetadata(): SsoMetadata {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
  return {
    base,
    entityId: process.env.KUL_OIDC_CLIENT_ID || DEFAULT_ENTITY_ID,
    // Het pad staat vast (KUL_CALLBACK_PATH), want het is wat bij ICTS
    // geregistreerd staat; better-auth 1.7 verhuisde zijn eigen callback.
    redirectUri: process.env.KUL_OIDC_REDIRECT_URI || `${base}${KUL_CALLBACK_PATH}`,
    infoUrl: `${base}/nl/ledenportaal`,
    privacyUrl: `${base}/nl/privacy`,
    logoUrl: `${base}${SSO_LOGO.path}`,
    logoWidth: SSO_LOGO.width,
    logoHeight: SSO_LOGO.height,
  };
}
