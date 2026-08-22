import "server-only";

import type { VaultConfig } from "./config";

/**
 * De Vaultwarden-API, getypeerd.
 *
 * Twee dingen die je hier moet weten voor je iets toevoegt:
 *
 * - **De casing is niet consistent.** De identity-endpoints antwoorden in
 *   PascalCase (`Key`, `PrivateKey`), de api-endpoints in camelCase (`id`,
 *   `name`). Lees velden daarom via {@link field}, anders werkt je code op de
 *   ene helft van de API en geeft ze stil `undefined` op de andere.
 * - **Wij authenticeren als het botaccount**, met een persoonlijke API-key over
 *   `grant_type=client_credentials`. Dat account is eigenaar van de organisatie;
 *   daar komt de organisatiesleutel vandaan waarmee de admin items leest en
 *   schrijft.
 */

/** Leest een veld dat de API in PascalCase of in camelCase kan teruggeven. */
export function field<T = unknown>(obj: unknown, name: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;
  const upper = name.charAt(0).toUpperCase() + name.slice(1);
  return (record[name] ?? record[upper]) as T | undefined;
}

export class VaultError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

type TokenCache = { token: string; expiresAt: number };

// Per proces gecachet: een token is ~2 uur geldig en een nieuwe login per
// request zou bij elke pagina een PBKDF2-vrije maar wel volledige round-trip
// kosten.
const tokens = new Map<string, TokenCache>();

/**
 * Een geldig access token voor het botaccount.
 *
 * De device-velden zijn verplicht, ook voor een API-key-login: laat je ze weg,
 * dan antwoordt Vaultwarden met een weinig zeggende 400.
 */
async function accessToken(cfg: VaultConfig): Promise<string> {
  const cached = tokens.get(cfg.clientId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`${cfg.url}/identity/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "api",
      deviceType: "9",
      deviceIdentifier: deviceIdentifier(cfg),
      deviceName: "vtk-admin",
    }).toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new VaultError("Aanmelden bij de kluis is mislukt.", res.status, body);
  }
  const token = field<string>(body, "access_token");
  const expiresIn = field<number>(body, "expires_in") ?? 3600;
  if (!token) throw new VaultError("Geen token teruggekregen.", res.status, body);

  tokens.set(cfg.clientId, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

/**
 * Een vaste device-id per botaccount. Vaultwarden houdt per device een sessie
 * bij; een willekeurige id per aanroep laat er eindeloos veel achter.
 */
function deviceIdentifier(cfg: VaultConfig): string {
  // Afgeleid van de clientId zodat hij stabiel is zonder ergens bewaard te
  // moeten worden. De vorm moet een uuid zijn.
  const hex = Buffer.from(cfg.clientId).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Gooit het gecachete token weg; gebruikt na een 401. */
function forgetToken(cfg: VaultConfig): void {
  tokens.delete(cfg.clientId);
}

async function request<T>(
  cfg: VaultConfig,
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const res = await fetch(`${cfg.url}${path}`, {
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
    return request<T>(cfg, method, path, body, false);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      field<string>(parsed, "message") ?? `Kluis gaf ${res.status} op ${method} ${path}.`;
    throw new VaultError(message, res.status, parsed);
  }
  return parsed as T;
}

// -----------------------------------------------------------------------------
// Collections
// -----------------------------------------------------------------------------

export type VaultCollection = { id: string; name: string; externalId: string | null };

function toCollection(raw: unknown): VaultCollection {
  return {
    id: field<string>(raw, "id")!,
    name: field<string>(raw, "name") ?? "",
    externalId: field<string>(raw, "externalId") ?? null,
  };
}

export async function listCollections(cfg: VaultConfig): Promise<VaultCollection[]> {
  const res = await request<unknown>(cfg, "GET", `/api/organizations/${cfg.orgId}/collections`);
  return (field<unknown[]>(res, "data") ?? []).map(toCollection);
}

export async function createCollection(
  cfg: VaultConfig,
  encryptedName: string,
  externalId: string,
): Promise<VaultCollection> {
  const res = await request<unknown>(cfg, "POST", `/api/organizations/${cfg.orgId}/collections`, {
    name: encryptedName,
    externalId,
    groups: [],
    users: [],
  });
  return toCollection(res);
}

export async function renameCollection(
  cfg: VaultConfig,
  collectionId: string,
  encryptedName: string,
  externalId: string,
): Promise<void> {
  await request(cfg, "PUT", `/api/organizations/${cfg.orgId}/collections/${collectionId}`, {
    name: encryptedName,
    externalId,
    groups: [],
    users: [],
  });
}

// -----------------------------------------------------------------------------
// Groepen
// -----------------------------------------------------------------------------

export type VaultGroup = { id: string; name: string; externalId: string | null };

export async function listGroups(cfg: VaultConfig): Promise<VaultGroup[]> {
  const res = await request<unknown>(cfg, "GET", `/api/organizations/${cfg.orgId}/groups`);
  return (field<unknown[]>(res, "data") ?? []).map((raw) => ({
    id: field<string>(raw, "id")!,
    name: field<string>(raw, "name") ?? "",
    externalId: field<string>(raw, "externalId") ?? null,
  }));
}

export async function createGroup(
  cfg: VaultConfig,
  name: string,
  externalId: string,
  collectionId: string,
): Promise<VaultGroup> {
  const res = await request<unknown>(cfg, "POST", `/api/organizations/${cfg.orgId}/groups`, {
    name,
    externalId,
    accessAll: false,
    collections: [{ id: collectionId, readOnly: false, hidePasswords: false, manage: false }],
    users: [],
  });
  return {
    id: field<string>(res, "id")!,
    name: field<string>(res, "name") ?? name,
    externalId: field<string>(res, "externalId") ?? externalId,
  };
}

export async function setGroupMembers(
  cfg: VaultConfig,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  await request(cfg, "PUT", `/api/organizations/${cfg.orgId}/groups/${groupId}/users`, memberIds);
}

export async function getGroupMembers(cfg: VaultConfig, groupId: string): Promise<string[]> {
  const res = await request<unknown>(
    cfg,
    "GET",
    `/api/organizations/${cfg.orgId}/groups/${groupId}/users`,
  );
  return Array.isArray(res) ? (res as string[]) : (field<string[]>(res, "data") ?? []);
}

// -----------------------------------------------------------------------------
// Leden
// -----------------------------------------------------------------------------

/**
 * De statussen die Vaultwarden voor een organisatielid kent. `Invited` heeft nog
 * geen sleutelpaar en kan dus niet bevestigd worden; dat is een wachtstand, geen
 * fout.
 */
export const MEMBER_STATUS = {
  revoked: -1,
  invited: 0,
  accepted: 1,
  confirmed: 2,
} as const;

export type VaultMember = {
  id: string;
  userId: string | null;
  email: string;
  status: number;
  type: number;
};

function toMember(raw: unknown): VaultMember {
  return {
    id: field<string>(raw, "id")!,
    userId: field<string>(raw, "userId") ?? null,
    email: (field<string>(raw, "email") ?? "").trim().toLowerCase(),
    status: field<number>(raw, "status") ?? MEMBER_STATUS.invited,
    type: field<number>(raw, "type") ?? 2,
  };
}

export async function listMembers(cfg: VaultConfig): Promise<VaultMember[]> {
  const res = await request<unknown>(cfg, "GET", `/api/organizations/${cfg.orgId}/users`);
  return (field<unknown[]>(res, "data") ?? []).map(toMember);
}

/**
 * Nodigt een adres uit als gewoon lid (`type: 2`, User). Toegang tot iets krijgt
 * het lid enkel via zijn groepen, dus `accessAll` staat uit.
 */
export async function inviteMember(cfg: VaultConfig, email: string): Promise<void> {
  await request(cfg, "POST", `/api/organizations/${cfg.orgId}/users/invite`, {
    emails: [email],
    type: 2,
    accessAll: false,
    collections: [],
    groups: [],
  });
}

/** De publieke sleutel van een lid, om de organisatiesleutel naar toe te wrappen. */
export async function memberPublicKey(cfg: VaultConfig, userId: string): Promise<Buffer> {
  const res = await request<unknown>(cfg, "GET", `/api/users/${userId}/public-key`);
  const key = field<string>(res, "publicKey");
  if (!key) throw new VaultError("Lid heeft nog geen publieke sleutel.", 404, res);
  return Buffer.from(key, "base64");
}

/**
 * Bevestigt een lid: hier krijgt het de organisatiesleutel, versleuteld met zijn
 * eigen publieke sleutel. Dit is het enige moment waarop wij asymmetrisch werken.
 */
export async function confirmMember(
  cfg: VaultConfig,
  memberId: string,
  wrappedOrgKey: string,
): Promise<void> {
  await request(cfg, "POST", `/api/organizations/${cfg.orgId}/users/${memberId}/confirm`, {
    key: wrappedOrgKey,
  });
}

/**
 * Haalt een lid uit de organisatie. Dat is wat "toegang weg" betekent: elk
 * gedeeld wachtwoord verdwijnt bij hen. Het Vaultwarden-account zelf blijft
 * bestaan, want daar hangt ook hun persoonlijke kluis aan, en die is van hen.
 */
export async function removeMember(cfg: VaultConfig, memberId: string): Promise<void> {
  await request(cfg, "DELETE", `/api/organizations/${cfg.orgId}/users/${memberId}`);
}

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------

export type RawCipher = {
  id: string;
  key: string | null;
  name: string;
  notes: string | null;
  login: {
    username: string | null;
    password: string | null;
    uris: { uri: string | null }[] | null;
  } | null;
  collectionIds: string[];
  revisionDate: string | null;
};

function toCipher(raw: unknown): RawCipher {
  const login = field<Record<string, unknown>>(raw, "login") ?? null;
  const uris = login ? (field<unknown[]>(login, "uris") ?? []) : [];
  return {
    id: field<string>(raw, "id")!,
    key: field<string>(raw, "key") ?? null,
    name: field<string>(raw, "name") ?? "",
    notes: field<string>(raw, "notes") ?? null,
    login: login
      ? {
          username: field<string>(login, "username") ?? null,
          password: field<string>(login, "password") ?? null,
          uris: uris.map((u) => ({ uri: field<string>(u, "uri") ?? null })),
        }
      : null,
    collectionIds: field<string[]>(raw, "collectionIds") ?? [],
    revisionDate: field<string>(raw, "revisionDate") ?? null,
  };
}

/** Alle items van de organisatie, versleuteld zoals ze in de kluis staan. */
export async function listCiphers(cfg: VaultConfig): Promise<RawCipher[]> {
  const res = await request<unknown>(
    cfg,
    "GET",
    `/api/ciphers/organization-details?organizationId=${cfg.orgId}`,
  );
  return (field<unknown[]>(res, "data") ?? []).map(toCipher);
}

export type CipherPayload = {
  key: string;
  name: string;
  notes: string | null;
  username: string | null;
  password: string | null;
  uri: string | null;
};

function cipherBody(cfg: VaultConfig, payload: CipherPayload) {
  return {
    type: 1,
    organizationId: cfg.orgId,
    folderId: null,
    favorite: false,
    reprompt: 0,
    key: payload.key,
    name: payload.name,
    notes: payload.notes,
    login: {
      username: payload.username,
      password: payload.password,
      uris: payload.uri ? [{ uri: payload.uri, match: null }] : [],
      totp: null,
    },
    fields: [],
    passwordHistory: [],
  };
}

export async function createCipher(
  cfg: VaultConfig,
  collectionId: string,
  payload: CipherPayload,
): Promise<string> {
  const res = await request<unknown>(cfg, "POST", `/api/ciphers/create`, {
    collectionIds: [collectionId],
    cipher: cipherBody(cfg, payload),
  });
  return field<string>(res, "id")!;
}

export async function updateCipher(
  cfg: VaultConfig,
  cipherId: string,
  payload: CipherPayload,
): Promise<void> {
  await request(cfg, "PUT", `/api/ciphers/${cipherId}`, cipherBody(cfg, payload));
}

export async function deleteCipher(cfg: VaultConfig, cipherId: string): Promise<void> {
  await request(cfg, "DELETE", `/api/ciphers/${cipherId}`);
}
