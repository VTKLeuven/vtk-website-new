import "server-only";
import { prisma } from "@vtk/db";
import { decryptSecret } from "@/lib/secrets";

/**
 * Runtime-configuratie van de wachtwoordkluis, beheerd via Admin -> IT en
 * bewaard in de `Setting`-tabel, net als de deur- en S3-config.
 *
 * Waarom niet in de omgeving: `orgKey` kan élk gedeeld wachtwoord van VTK
 * ontsleutelen. Zo'n waarde hoort niet in een `.env` die in elke container en in
 * elke `docker compose config` meekomt; hier staat ze versleuteld
 * (`lib/secrets.ts`) en achter een superadmin-scherm.
 *
 * Zie `docs/wachtwoorden.md`.
 */

export const VAULT_SETTING_KEY = "vault.config";

/** Vorm zoals bewaard in de DB: de twee geheimen staan versleuteld. */
export type StoredVault = {
  url?: string;
  orgId?: string;
  /** `user.<uuid>` van het botaccount. */
  clientId?: string;
  clientSecretEnc?: string;
  /** De organisatiesleutel (64 bytes, base64) versleuteld met `encryptSecret`. */
  orgKeyEnc?: string;
};

export type VaultConfig = {
  /** Basis-URL van Vaultwarden, zonder trailing slash. */
  url: string;
  orgId: string;
  clientId: string;
  clientSecret: string;
  /** 64 bytes: 32 encrypt + 32 MAC. */
  orgKey: Buffer;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * De live config, of `null` wanneer de koppeling niet (volledig) ingesteld is.
 *
 * Bewust `null` en geen throw: de kluis is een optionele integratie, precies
 * zoals Brevo en de deur. Een site zonder ingevulde config hoort gewoon te
 * draaien met de kluis-tab uitgeschakeld, niet te crashen.
 */
export async function getVaultConfig(): Promise<VaultConfig | null> {
  let stored: StoredVault | null = null;
  try {
    const row = await prisma.setting.findUnique({ where: { key: VAULT_SETTING_KEY } });
    stored = (row?.value ?? null) as unknown as StoredVault | null;
  } catch {
    return null;
  }
  if (!stored?.url || !stored.orgId || !stored.clientId) return null;
  if (!stored.clientSecretEnc || !stored.orgKeyEnc) return null;

  let clientSecret: string;
  let orgKey: Buffer;
  try {
    clientSecret = decryptSecret(stored.clientSecretEnc);
    orgKey = Buffer.from(decryptSecret(stored.orgKeyEnc), "base64");
  } catch {
    // Een onleesbaar geheim betekent dat BETTER_AUTH_SECRET veranderd is. Dan is
    // de config niet half stuk maar helemaal, en moet iemand ze opnieuw invullen.
    return null;
  }
  if (orgKey.length !== 64) return null;

  return {
    url: stripTrailingSlash(stored.url),
    orgId: stored.orgId,
    clientId: stored.clientId,
    clientSecret,
    orgKey,
  };
}

/** Publieke URL van de kluis voor links in de admin, ook zonder volledige config. */
export async function vaultPublicUrl(): Promise<string | null> {
  const configured = process.env.VAULT_PUBLIC_URL?.trim();
  if (configured) return stripTrailingSlash(configured);
  try {
    const row = await prisma.setting.findUnique({ where: { key: VAULT_SETTING_KEY } });
    const stored = (row?.value ?? null) as unknown as StoredVault | null;
    return stored?.url ? stripTrailingSlash(stored.url) : null;
  } catch {
    return null;
  }
}

/** Status voor het configuratiescherm; geheimen geven we nooit terug. */
export type VaultStatus = {
  configured: boolean;
  url: string | null;
  orgId: string | null;
  clientId: string | null;
  hasSecret: boolean;
  hasOrgKey: boolean;
};

export async function getVaultStatus(): Promise<VaultStatus> {
  let stored: StoredVault | null = null;
  try {
    const row = await prisma.setting.findUnique({ where: { key: VAULT_SETTING_KEY } });
    stored = (row?.value ?? null) as unknown as StoredVault | null;
  } catch {
    /* val terug op leeg */
  }
  return {
    configured: (await getVaultConfig()) !== null,
    url: stored?.url ?? null,
    orgId: stored?.orgId ?? null,
    clientId: stored?.clientId ?? null,
    hasSecret: Boolean(stored?.clientSecretEnc),
    hasOrgKey: Boolean(stored?.orgKeyEnc),
  };
}
