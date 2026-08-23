import "server-only";

import jwt from "jsonwebtoken";
import type { GoogleConfig } from "./config";

/**
 * De Google Admin SDK, getypeerd en beperkt tot wat we effectief gebruiken.
 *
 * Drie dingen die je moet weten voor je hier iets toevoegt:
 *
 * - **We authenticeren als service-account met domain-wide delegation.** De
 *   sleutel tekent een JWT die we bij Google inruilen voor een access token, en
 *   `sub` is de beheerder die we impersonateren. Zonder die `sub` mag een
 *   service-account niets in de Directory: je krijgt dan een 401 met
 *   `unauthorized_client`, wat eruitziet als een fout in de sleutel maar het
 *   ontbreken van de delegatie is.
 * - **Groups Settings is een aparte API** (`groupssettings.googleapis.com`) met
 *   een eigen scope. Wie mag posten en of externe leden toegelaten zijn, staat
 *   daar en niet op het `Group`-object van de Directory API.
 * - **Een 404 is vaak een antwoord, geen fout.** Een groep die nog niet bestaat
 *   hoort `null` te geven, zodat de sync ze kan aanmaken.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DIRECTORY = "https://admin.googleapis.com/admin/directory/v1";
const GROUPS_SETTINGS = "https://www.googleapis.com/groups/v1/groups";

/**
 * Enkel wat we nodig hebben. `admin.directory.user.readonly` staat erbij voor
 * het koppelscherm; schrijven op gebruikers (accounts aanmaken) komt bewust pas
 * met de volgende fase, samen met de scope die daarbij hoort.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.group.member",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/apps.groups.settings",
].join(" ");

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

type TokenCache = { token: string; expiresAt: number };

// Per proces gecachet: een token is een uur geldig, en een nieuwe JWT-uitwisseling
// per aanroep zou elke sync tientallen round-trips extra kosten.
const tokens = new Map<string, TokenCache>();

function cacheKey(cfg: GoogleConfig): string {
  return `${cfg.clientEmail}|${cfg.subject}`;
}

async function accessToken(cfg: GoogleConfig): Promise<string> {
  const key = cacheKey(cfg);
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  let assertion: string;
  try {
    assertion = jwt.sign(
      {
        iss: cfg.clientEmail,
        sub: cfg.subject,
        scope: GOOGLE_SCOPES,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      },
      cfg.privateKey,
      { algorithm: "RS256" },
    );
  } catch (err) {
    // Een kapotte PEM faalt hier, nog voor er een request vertrekt. Dat is een
    // configuratiefout en geen storing bij Google; zeg dat ook zo.
    throw new GoogleError(
      `De private key van het service-account is onbruikbaar: ${err instanceof Error ? err.message : String(err)}`,
      0,
      null,
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!res.ok || !body?.access_token) {
    const detail = body?.error_description ?? body?.error ?? "onbekende fout";
    throw new GoogleError(`Aanmelden bij Google is mislukt: ${detail}`, res.status, body);
  }

  tokens.set(key, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

/** Gooit het gecachete token weg; gebruikt na een 401. */
function forgetToken(cfg: GoogleConfig): void {
  tokens.delete(cacheKey(cfg));
}

async function request<T>(
  cfg: GoogleConfig,
  method: string,
  url: string,
  body?: unknown,
  retry = true,
): Promise<T | null> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken(cfg)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (res.status === 401 && retry) {
    // Token ingetrokken of verlopen: één keer opnieuw, dan pas opgeven.
    forgetToken(cfg);
    return request<T>(cfg, method, url, body, false);
  }

  // Een onbestaande groep of een lid dat er al niet meer in zit is geen storing.
  if (res.status === 404) return null;

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (parsed as { error?: { message?: string } } | null)?.error?.message ??
      `${res.status} ${res.statusText}`;
    throw new GoogleError(message, res.status, parsed);
  }
  return (parsed ?? null) as T | null;
}

// -----------------------------------------------------------------------------
// Groepen
// -----------------------------------------------------------------------------

export type GoogleGroup = {
  id: string;
  email: string;
  name: string;
  description?: string;
};

export async function getGroup(cfg: GoogleConfig, key: string): Promise<GoogleGroup | null> {
  return request<GoogleGroup>(cfg, "GET", `${DIRECTORY}/groups/${encodeURIComponent(key)}`);
}

export async function createGroup(
  cfg: GoogleConfig,
  input: { email: string; name: string; description?: string },
): Promise<GoogleGroup> {
  const created = await request<GoogleGroup>(cfg, "POST", `${DIRECTORY}/groups`, input);
  if (!created) throw new GoogleError("Google gaf geen groep terug bij het aanmaken.", 0, null);
  return created;
}

export async function updateGroup(
  cfg: GoogleConfig,
  key: string,
  input: { name?: string; description?: string },
): Promise<void> {
  await request(cfg, "PUT", `${DIRECTORY}/groups/${encodeURIComponent(key)}`, input);
}

/** Alle groepen van het domein, voor het koppelscherm. */
export async function listGroups(cfg: GoogleConfig): Promise<GoogleGroup[]> {
  const out: GoogleGroup[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ domain: cfg.domain, maxResults: "200" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await request<{ groups?: GoogleGroup[]; nextPageToken?: string }>(
      cfg,
      "GET",
      `${DIRECTORY}/groups?${params.toString()}`,
    );
    out.push(...(page?.groups ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  return out;
}

// -----------------------------------------------------------------------------
// Leden
// -----------------------------------------------------------------------------

export type GoogleMember = {
  id: string;
  email: string;
  /** OWNER, MANAGER of MEMBER. Wij beheren enkel MEMBER. */
  role: "OWNER" | "MANAGER" | "MEMBER";
  /** USER, GROUP, CUSTOMER of EXTERNAL. */
  type: string;
  status?: string;
};

export async function listMembers(cfg: GoogleConfig, groupKey: string): Promise<GoogleMember[]> {
  const out: GoogleMember[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "200" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await request<{ members?: GoogleMember[]; nextPageToken?: string }>(
      cfg,
      "GET",
      `${DIRECTORY}/groups/${encodeURIComponent(groupKey)}/members?${params.toString()}`,
    );
    out.push(...(page?.members ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  // Een lid zonder adres (een verwijderd account) kunnen we nergens mee
  // vergelijken; laat het staan in plaats van erover te struikelen.
  return out.filter((m) => Boolean(m.email));
}

export async function addMember(
  cfg: GoogleConfig,
  groupKey: string,
  email: string,
): Promise<void> {
  try {
    await request(cfg, "POST", `${DIRECTORY}/groups/${encodeURIComponent(groupKey)}/members`, {
      email,
      role: "MEMBER",
    });
  } catch (err) {
    // 409 = zit er al in. Dat is precies de toestand die we wilden bereiken.
    if (err instanceof GoogleError && err.status === 409) return;
    throw err;
  }
}

export async function removeMember(
  cfg: GoogleConfig,
  groupKey: string,
  memberKey: string,
): Promise<void> {
  await request(
    cfg,
    "DELETE",
    `${DIRECTORY}/groups/${encodeURIComponent(groupKey)}/members/${encodeURIComponent(memberKey)}`,
  );
}

// -----------------------------------------------------------------------------
// Groepsinstellingen (aparte API)
// -----------------------------------------------------------------------------

export type GoogleGroupSettings = {
  whoCanPostMessage?: string;
  allowExternalMembers?: string;
  whoCanJoin?: string;
  whoCanViewGroup?: string;
  messageModerationLevel?: string;
};

export async function getGroupSettings(
  cfg: GoogleConfig,
  groupEmail: string,
): Promise<GoogleGroupSettings | null> {
  return request<GoogleGroupSettings>(
    cfg,
    "GET",
    `${GROUPS_SETTINGS}/${encodeURIComponent(groupEmail)}?alt=json`,
  );
}

export async function patchGroupSettings(
  cfg: GoogleConfig,
  groupEmail: string,
  settings: GoogleGroupSettings,
): Promise<void> {
  await request(
    cfg,
    "PATCH",
    `${GROUPS_SETTINGS}/${encodeURIComponent(groupEmail)}?alt=json`,
    settings,
  );
}

// -----------------------------------------------------------------------------
// Gebruikers (alleen lezen, voor het koppelscherm)
// -----------------------------------------------------------------------------

export type GoogleUser = {
  id: string;
  primaryEmail: string;
  name?: { givenName?: string; familyName?: string; fullName?: string };
  suspended?: boolean;
};

export async function listUsers(cfg: GoogleConfig): Promise<GoogleUser[]> {
  const out: GoogleUser[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      domain: cfg.domain,
      maxResults: "200",
      orderBy: "email",
      projection: "basic",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await request<{ users?: GoogleUser[]; nextPageToken?: string }>(
      cfg,
      "GET",
      `${DIRECTORY}/users?${params.toString()}`,
    );
    out.push(...(page?.users ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  return out;
}
