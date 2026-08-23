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
 * Scopes voor het service-account, aangeroepen als de beheerder uit de config.
 * `admin.directory.user` (schrijven) is nodig om accounts aan te maken en om
 * iemand tussen organisatie-eenheden te verplaatsen.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.group.member",
  "https://www.googleapis.com/auth/admin.directory.user",
  "https://www.googleapis.com/auth/admin.directory.user.alias",
  "https://www.googleapis.com/auth/apps.groups.settings",
].join(" ");

/**
 * Scopes voor de Gmail-instellingen van één lid (afzenderadres, doorsturen).
 *
 * Die calls lopen **als dat lid**, niet als de beheerder: Gmail-instellingen
 * bestaan per postbus. Daarom een aparte tokenaanvraag met een andere `sub`, en
 * daarom moeten deze scopes ook los toegekend worden in de delegatie. Vergeet je
 * dat, dan werkt de rest gewoon en falen enkel deze twee dingen.
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",
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

function cacheKey(cfg: GoogleConfig, subject: string, scope: string): string {
  return `${cfg.clientEmail}|${subject}|${scope}`;
}

async function accessToken(
  cfg: GoogleConfig,
  subject: string = cfg.subject,
  scope: string = GOOGLE_SCOPES,
): Promise<string> {
  const key = cacheKey(cfg, subject, scope);
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  let assertion: string;
  try {
    assertion = jwt.sign(
      {
        iss: cfg.clientEmail,
        sub: subject,
        scope,
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
function forgetToken(cfg: GoogleConfig, subject: string, scope: string): void {
  tokens.delete(cacheKey(cfg, subject, scope));
}

/** Als welke gebruiker en met welke scopes een aanroep loopt. */
type As = { subject?: string; scope?: string };

async function request<T>(
  cfg: GoogleConfig,
  method: string,
  url: string,
  body?: unknown,
  as: As = {},
  retry = true,
): Promise<T | null> {
  const subject = as.subject ?? cfg.subject;
  const scope = as.scope ?? GOOGLE_SCOPES;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken(cfg, subject, scope)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (res.status === 401 && retry) {
    // Token ingetrokken of verlopen: één keer opnieuw, dan pas opgeven.
    forgetToken(cfg, subject, scope);
    return request<T>(cfg, method, url, body, as, false);
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
  orgUnitPath?: string;
  /** Nodig om te weten of een voorgesteld adres al bezet is. */
  aliases?: string[];
};

export async function listUsers(cfg: GoogleConfig): Promise<GoogleUser[]> {
  const out: GoogleUser[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      domain: cfg.domain,
      maxResults: "200",
      orderBy: "email",
      // `full` en niet `basic`: we hebben de aliassen nodig om te zien of een
      // voorgesteld adres al bezet is. Een alias van iemand anders levert
      // anders pas bij het aanmaken een 409 op.
      projection: "full",
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


export async function getUser(cfg: GoogleConfig, key: string): Promise<GoogleUser | null> {
  return request<GoogleUser>(cfg, "GET", `${DIRECTORY}/users/${encodeURIComponent(key)}`);
}

/**
 * Maakt een account aan.
 *
 * `changePasswordAtNextLogin` staat altijd aan: het wachtwoord dat wij genereren
 * is een doorgeefwachtwoord, geen wachtwoord om mee te leven.
 */
export async function createUser(
  cfg: GoogleConfig,
  input: {
    primaryEmail: string;
    givenName: string;
    familyName: string;
    password: string;
    orgUnitPath?: string;
  },
): Promise<GoogleUser> {
  const created = await request<GoogleUser>(cfg, "POST", `${DIRECTORY}/users`, {
    primaryEmail: input.primaryEmail,
    name: { givenName: input.givenName, familyName: input.familyName },
    password: input.password,
    changePasswordAtNextLogin: true,
    ...(input.orgUnitPath ? { orgUnitPath: input.orgUnitPath } : {}),
  });
  if (!created) {
    throw new GoogleError("Google gaf geen account terug bij het aanmaken.", 0, null);
  }
  return created;
}

/** Verplaatst iemand naar een andere organisatie-eenheid. */
export async function moveUser(
  cfg: GoogleConfig,
  key: string,
  orgUnitPath: string,
): Promise<void> {
  await request(cfg, "PUT", `${DIRECTORY}/users/${encodeURIComponent(key)}`, { orgUnitPath });
}

export async function addAlias(cfg: GoogleConfig, key: string, alias: string): Promise<void> {
  try {
    await request(cfg, "POST", `${DIRECTORY}/users/${encodeURIComponent(key)}/aliases`, {
      alias,
    });
  } catch (err) {
    // 409 = die alias staat er al op; dat is de toestand die we wilden.
    if (err instanceof GoogleError && err.status === 409) return;
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Gmail-instellingen van één lid
// -----------------------------------------------------------------------------
// Deze aanroepen lopen als dat lid (`subject`), niet als de beheerder.

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users";

function asUser(email: string): As {
  return { subject: email, scope: GMAIL_SCOPES };
}

export type SendAs = {
  sendAsEmail: string;
  isDefault?: boolean;
  isPrimary?: boolean;
  verificationStatus?: string;
};

export async function listSendAs(cfg: GoogleConfig, email: string): Promise<SendAs[]> {
  const res = await request<{ sendAs?: SendAs[] }>(
    cfg,
    "GET",
    `${GMAIL}/${encodeURIComponent(email)}/settings/sendAs`,
    undefined,
    asUser(email),
  );
  return res?.sendAs ?? [];
}

/**
 * Zet een alias als afzenderadres en maakt hem de standaard.
 *
 * Dit is het enige wat we programmatisch kunnen doen aan "stuur vanaf je
 * kiesploegadres". Verhinderen dat iemand tóch zijn primaire adres kiest, kan
 * enkel met een routing-regel op de organisatie-eenheid; daar is geen API voor.
 * Zie docs/design-decisions.md.
 */
export async function ensureDefaultSendAs(
  cfg: GoogleConfig,
  email: string,
  alias: string,
): Promise<void> {
  const existing = await listSendAs(cfg, email);
  const current = existing.find((s) => s.sendAsEmail.toLowerCase() === alias.toLowerCase());
  if (!current) {
    await request(
      cfg,
      "POST",
      `${GMAIL}/${encodeURIComponent(email)}/settings/sendAs`,
      { sendAsEmail: alias, isDefault: true, treatAsAlias: true },
      asUser(email),
    );
    return;
  }
  if (current.isDefault) return;
  await request(
    cfg,
    "PATCH",
    `${GMAIL}/${encodeURIComponent(email)}/settings/sendAs/${encodeURIComponent(alias)}`,
    { isDefault: true },
    asUser(email),
  );
}

/** Zet het primaire adres terug als standaardafzender. */
export async function resetDefaultSendAs(cfg: GoogleConfig, email: string): Promise<void> {
  const existing = await listSendAs(cfg, email);
  const primary = existing.find((s) => s.isPrimary);
  if (!primary || primary.isDefault) return;
  await request(
    cfg,
    "PATCH",
    `${GMAIL}/${encodeURIComponent(email)}/settings/sendAs/${encodeURIComponent(primary.sendAsEmail)}`,
    { isDefault: true },
    asUser(email),
  );
}

/**
 * Stuurt alle inkomende mail door naar `target` en houdt geen kopie.
 *
 * Google stuurt bij het aanmaken van een doorstuuradres een bevestigingsmail
 * naar dat adres; zolang die niet aanvaard is, blijft de status `pending` en
 * gebeurt er niets. Dat is hier geen probleem maar een kenmerk: die bevestiging
 * is meteen het bewijs dat het adres van hen is.
 */
export async function enableForwarding(
  cfg: GoogleConfig,
  email: string,
  target: string,
): Promise<{ pending: boolean }> {
  const created = await request<{ verificationStatus?: string }>(
    cfg,
    "POST",
    `${GMAIL}/${encodeURIComponent(email)}/settings/forwardingAddresses`,
    { forwardingEmail: target },
    asUser(email),
  );
  const pending = (created?.verificationStatus ?? "accepted") !== "accepted";
  if (pending) return { pending: true };

  await request(
    cfg,
    "PUT",
    `${GMAIL}/${encodeURIComponent(email)}/settings/autoForwarding`,
    { enabled: true, emailAddress: target, disposition: "markRead" },
    asUser(email),
  );
  return { pending: false };
}

export async function disableForwarding(cfg: GoogleConfig, email: string): Promise<void> {
  await request(
    cfg,
    "PUT",
    `${GMAIL}/${encodeURIComponent(email)}/settings/autoForwarding`,
    { enabled: false },
    asUser(email),
  );
}
