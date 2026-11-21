import "server-only";
import { prisma } from "@vtk/db";
import { decryptSecret } from "@/lib/secrets";

/**
 * Runtime-configuratie voor AI-vertaling in de admin (NL <-> EN), beheerd via
 * Admin -> IT en bewaard in de `Setting`-tabel (net als S3, Sentry en Deur).
 * De API-sleutel staat versleuteld; hier ontsleutelen we ze enkel server-side.
 * Zonder DB-config vallen we terug op de omgeving (`AI_API_*`).
 *
 * Werkt met elke OpenAI-compatible endpoint (`/chat/completions`): zowel
 * Open WebUI (`https://llm.vtk.be/api` met Bearer API-key) als vLLM direct
 * over Tailscale (`http://kenny:8000/v1`).
 */

export const AI_SETTING_KEY = "ai.config";
export const DEFAULT_AI_MODEL = "kenny-active";

/** Vorm zoals in de DB bewaard: de API-sleutel staat versleuteld in `apiKeyEnc`. */
export type StoredAiConfig = {
  apiUrl?: string;
  model?: string;
  apiKeyEnc?: string;
};

export type AiConfig = {
  /** Basis-URL zonder trailing slash (bv. https://llm.vtk.be/api of http://kenny:8000/v1). */
  apiUrl: string;
  /** Optionele Bearer API-key. */
  apiKey: string;
  /** Modelnaam meegegeven aan `/chat/completions`. */
  model: string;
};

function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function envAiConfig(): AiConfig {
  return {
    apiUrl: stripTrailingSlash(process.env.AI_API_URL || ""),
    apiKey: (process.env.AI_API_KEY || "").trim(),
    model: (process.env.AI_MODEL || "").trim() || DEFAULT_AI_MODEL,
  };
}

/** Live AI-config voor server-side vertaling. DB wint; anders de omgeving. */
export async function getAiConfig(): Promise<AiConfig> {
  const env = envAiConfig();
  try {
    const row = await prisma.setting.findUnique({ where: { key: AI_SETTING_KEY } });
    const v = (row?.value ?? null) as unknown as StoredAiConfig | null;
    if (v) {
      return {
        apiUrl: stripTrailingSlash(v.apiUrl || env.apiUrl),
        apiKey: v.apiKeyEnc ? decryptSecret(v.apiKeyEnc) : env.apiKey,
        model: (v.model || "").trim() || env.model,
      };
    }
  } catch {
    /* val terug op env */
  }
  return env;
}

/** Of er een AI-endpoint geconfigureerd is (bepaalt of vertaalknoppen verschijnen). */
export async function isAiConfigured(): Promise<boolean> {
  const cfg = await getAiConfig();
  return cfg.apiUrl.length > 0;
}

export type AiStatus = {
  source: "database" | "environment" | "unconfigured";
  apiUrl: string | null;
  model: string;
  /** Of er een API-key bekend is; de waarde zelf geven we nooit terug. */
  hasApiKey: boolean;
};

/** Niet-gevoelige status voor de IT-config-UI. Toont nooit de API-sleutel. */
export async function getAiStatus(): Promise<AiStatus> {
  const env = envAiConfig();
  try {
    const row = await prisma.setting.findUnique({ where: { key: AI_SETTING_KEY } });
    const v = (row?.value ?? null) as unknown as StoredAiConfig | null;
    if (v && (v.apiUrl || v.apiKeyEnc || v.model)) {
      const apiUrl = stripTrailingSlash(v.apiUrl || env.apiUrl) || null;
      return {
        source: apiUrl ? "database" : "unconfigured",
        apiUrl,
        model: (v.model || "").trim() || env.model,
        hasApiKey: Boolean(v.apiKeyEnc) || Boolean(env.apiKey),
      };
    }
  } catch {
    /* val terug op env */
  }
  return {
    source: env.apiUrl ? "environment" : "unconfigured",
    apiUrl: env.apiUrl || null,
    model: env.model,
    hasApiKey: Boolean(env.apiKey),
  };
}
