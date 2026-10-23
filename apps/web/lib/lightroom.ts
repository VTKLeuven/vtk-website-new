import "server-only";
import { prisma } from "@vtk/db";
import { decryptSecret } from "./secrets";
import { parseLightroomStatus, type LightroomStatus } from "./lightroom-view";

/**
 * De Lightroom-pc: een Windows-VM op kenny die GPU 0 van vLLM leent zolang
 * communicatie er foto's op bewerkt. De site praat over Tailscale met kenny's
 * `lightroom-api` (zie infra/lightroom), net zoals de deurknop met de Pi.
 *
 * De config (adres en token) staat in de `Setting`-tabel onder Admin -> IT, het
 * token versleuteld. Zonder DB-config vallen we terug op `LIGHTROOM_API_URL` en
 * `LIGHTROOM_API_TOKEN`, zoals de deur op `DOOR_*`.
 */

export const LIGHTROOM_SETTING_KEY = "lightroom.config";

/** Vorm zoals in de DB bewaard: het token staat versleuteld in `tokenEnc`. */
export type StoredLightroom = {
  apiUrl?: string;
  tokenEnc?: string;
  /** Het Parsec-account waarop de VM host, zodat de pagina zegt wie je als vriend toevoegt. */
  parsecAccount?: string;
};

export type LightroomConfig = { apiUrl: string; token: string; parsecAccount: string };

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function envLightroom(): LightroomConfig {
  return {
    apiUrl: stripTrailingSlash(process.env.LIGHTROOM_API_URL || ""),
    token: process.env.LIGHTROOM_API_TOKEN || "",
    parsecAccount: process.env.LIGHTROOM_PARSEC_ACCOUNT || "",
  };
}

async function storedLightroom(): Promise<StoredLightroom | null> {
  const row = await prisma.setting.findUnique({ where: { key: LIGHTROOM_SETTING_KEY } });
  return (row?.value ?? null) as unknown as StoredLightroom | null;
}

/** Live config voor de oproepen naar kenny. DB wint; anders de omgeving. */
export async function getLightroomConfig(): Promise<LightroomConfig> {
  const env = envLightroom();
  try {
    const v = await storedLightroom();
    if (v) {
      return {
        apiUrl: stripTrailingSlash(v.apiUrl || env.apiUrl),
        token: v.tokenEnc ? decryptSecret(v.tokenEnc) : env.token,
        parsecAccount: v.parsecAccount || env.parsecAccount,
      };
    }
  } catch {
    /* val terug op env */
  }
  return env;
}

export type LightroomConfigStatus = {
  source: "database" | "environment";
  apiUrl: string | null;
  parsecAccount: string | null;
  /** Of er een token bekend is; de waarde zelf geven we nooit terug. */
  hasToken: boolean;
};

/** Niet-gevoelige status voor de IT-config-UI. Toont nooit het token. */
export async function getLightroomConfigStatus(): Promise<LightroomConfigStatus> {
  const env = envLightroom();
  const v = await storedLightroom();
  if (v && (v.apiUrl || v.tokenEnc || v.parsecAccount)) {
    return {
      source: "database",
      apiUrl: v.apiUrl || env.apiUrl || null,
      parsecAccount: v.parsecAccount || env.parsecAccount || null,
      hasToken: Boolean(v.tokenEnc) || Boolean(env.token),
    };
  }
  return {
    source: "environment",
    apiUrl: env.apiUrl || null,
    parsecAccount: env.parsecAccount || null,
    hasToken: Boolean(env.token),
  };
}

export type LightroomError = "not_configured" | "unreachable" | "unauthorized" | "kenny_error" | "refused";

export type LightroomResult =
  | { ok: true; status: LightroomStatus }
  /** Bij `refused` zit de status erbij: daarin staat waarom. */
  | { ok: false; error: LightroomError; status?: LightroomStatus };

/**
 * Kenny kijkt bij elke vraag de GPU's, de containers en het geheugen na, en dat
 * via sudo; dat duurt een paar seconden. Ruim genoeg, maar geen minuut: een
 * kenny die niet antwoordt, moet de pagina snel zeggen.
 */
const KENNY_TIMEOUT_MS = 20_000;

async function callKenny(method: "GET" | "POST", path: string, by?: string): Promise<LightroomResult> {
  const cfg = await getLightroomConfig();
  if (!cfg.apiUrl || !cfg.token) return { ok: false, error: "not_configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KENNY_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify({ by: by ?? null }) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401) return { ok: false, error: "unauthorized" };
    const status = parseLightroomStatus(await res.json().catch(() => null));
    if (res.status === 409) return { ok: false, error: "refused", status: status ?? undefined };
    if (!res.ok || !status) return { ok: false, error: "kenny_error" };
    return { ok: true, status };
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchLightroomStatus(): Promise<LightroomResult> {
  return callKenny("GET", "/lightroom/status");
}

/**
 * Start de VM, of houdt hem wakker als hij al draait. Kenny antwoordt meteen
 * (202) en werkt op de achtergrond; de pagina volgt de status. `by` komt in
 * kenny's log en in de status ("gestart door").
 */
export function requestLightroomStart(by: string): Promise<LightroomResult> {
  return callKenny("POST", "/lightroom/start", by);
}

/** Slaapstand nu, zonder op de inactiviteit te wachten; vLLM komt meteen terug. */
export function requestLightroomStop(by: string): Promise<LightroomResult> {
  return callKenny("POST", "/lightroom/stop", by);
}
