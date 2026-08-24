import "server-only";

import jwt from "jsonwebtoken";
import type { GoogleConfig } from "./config";
import { getUser } from "./client";

/**
 * "Koppel je VTK-account": het lid meldt zich één keer aan met zijn eigen
 * `@vtk.be`-account, en wij onthouden welk Google-account bij welk lid hoort.
 *
 * Dit is **geen** inlogmethode. Aanmelden op de site blijft KU Leuven SSO; dit
 * is een aparte, kleine autorisatiestroom die enkel dient om de koppeling te
 * bewijzen. Vandaar ook een eigen OAuth-client naast het service-account.
 *
 * Drie dingen die hier stil misgaan als je ze vergeet, en die daarom alle drie
 * afgedwongen worden:
 *
 * - **`hd` is een filter voor de gebruiker, geen beveiliging.** Google toont
 *   met `hd` bij voorkeur accounts van dat domein, maar een handige gebruiker
 *   komt er met een privé-Gmail langs. Daarom controleren we het domein en
 *   `email_verified` server-side.
 * - **Zonder `prompt=select_account`** pakt Google het account dat toevallig in
 *   de browser ingelogd is, en dat is bij de helft van de leden hun privé-Gmail.
 * - **De `sub` uit het id-token is niet gegarandeerd hetzelfde nummer** als het
 *   id van de Directory API. We zoeken het account daarom op via de directory
 *   en gebruiken die id; dat bevestigt meteen dat het account in ons domein
 *   bestaat en niet in een ander Workspace-domein.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const LINK_STATE_COOKIE = "vtk_google_link_state";

export function linkRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/google/link/callback`;
}

export function authorizeUrl(cfg: GoogleConfig, origin: string, state: string): string | null {
  if (!cfg.oauth) return null;
  const params = new URLSearchParams({
    client_id: cfg.oauth.clientId,
    redirect_uri: linkRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Zie de kop: filter plus keuzescherm, en daarna alsnog server-side nakijken.
    hd: cfg.domain,
    prompt: "select_account",
    include_granted_scopes: "false",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type LinkedIdentity = {
  /** Id uit de Directory API; valt terug op de `sub` van het id-token. */
  googleUserId: string;
  email: string;
};

export type LinkFailure =
  | "NOT_CONFIGURED"
  | "EXCHANGE_FAILED"
  | "NO_EMAIL"
  | "UNVERIFIED"
  | "WRONG_DOMAIN"
  | "NOT_IN_DIRECTORY";

/**
 * Wisselt de code in en geeft terug wie zich zonet aanmeldde, of waarom het
 * geen geldige koppeling is.
 */
export async function exchangeLinkCode(
  cfg: GoogleConfig,
  origin: string,
  code: string,
): Promise<{ ok: true; identity: LinkedIdentity } | { ok: false; reason: LinkFailure; email?: string }> {
  if (!cfg.oauth) return { ok: false, reason: "NOT_CONFIGURED" };

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.oauth.clientId,
      client_secret: cfg.oauth.clientSecret,
      redirect_uri: linkRedirectUri(origin),
      grant_type: "authorization_code",
    }).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { id_token?: string } | null;
  if (!res.ok || !body?.id_token) return { ok: false, reason: "EXCHANGE_FAILED" };

  // Het token komt rechtstreeks van Google over TLS, in ruil voor onze
  // client secret. Handtekeningcontrole voegt daar niets aan toe; wat er wél
  // toe doet, staat hieronder.
  const claims = jwt.decode(body.id_token) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    hd?: string;
  } | null;

  const email = claims?.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "NO_EMAIL" };
  if (claims?.email_verified === false || claims?.email_verified === "false") {
    return { ok: false, reason: "UNVERIFIED", email };
  }
  if (!email.endsWith(`@${cfg.domain}`)) return { ok: false, reason: "WRONG_DOMAIN", email };

  let googleUserId = claims?.sub ?? "";
  try {
    const directoryUser = await getUser(cfg, email);
    if (!directoryUser) return { ok: false, reason: "NOT_IN_DIRECTORY", email };
    googleUserId = directoryUser.id;
  } catch {
    // Directory onbereikbaar: dan is de `sub` goed genoeg om de koppeling te
    // leggen. Ze is stabiel per account; enkel de zekerheid dat het account in
    // ons domein zit, valt weg, en die haalt het domeinfilter hierboven al.
    if (!googleUserId) return { ok: false, reason: "NOT_IN_DIRECTORY", email };
  }

  return { ok: true, identity: { googleUserId, email } };
}
