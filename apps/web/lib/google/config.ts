import "server-only";
import { prisma } from "@vtk/db";
import { decryptSecret } from "@/lib/secrets";

/**
 * Runtime-configuratie van de Google Workspace-koppeling, beheerd via Admin ->
 * IT en bewaard in de `Setting`-tabel, net als de kluis-, deur- en S3-config.
 *
 * Waarom niet in de omgeving: dit is een service-account met domain-wide
 * delegation. Zo'n sleutel kan binnen het domein doen wat de toegekende scopes
 * toelaten, en dat hoort niet in een `.env` die in elke container en in elke
 * `docker compose config` meekomt. Hier staat ze versleuteld
 * (`lib/secrets.ts`) en achter een superadmin-scherm.
 *
 * Zie docs/design-decisions.md, "Google Workspace: postadressen, accounts en de
 * kiesploeg".
 */

export const GOOGLE_SETTING_KEY = "google.config";

/** Vorm zoals bewaard in de DB: de private key staat versleuteld. */
export type StoredGoogle = {
  /** Het domein waarvan we de groepen beheren, bv. "vtk.be". */
  domain?: string;
  /** Beheerder die het service-account impersonateert, bv. "it@vtk.be". */
  subject?: string;
  /** `client_email` uit het JSON-sleutelbestand van het service-account. */
  clientEmail?: string;
  /** `private_key` uit datzelfde bestand, versleuteld met `encryptSecret`. */
  privateKeyEnc?: string;
};

export type GoogleConfig = {
  domain: string;
  subject: string;
  clientEmail: string;
  /** PEM, met echte newlines. */
  privateKey: string;
};

export type GoogleStatus = {
  configured: boolean;
  domain: string | null;
  subject: string | null;
  clientEmail: string | null;
  hasKey: boolean;
};

/**
 * Een sleutel uit een Google-JSON komt met letterlijke `\n`-reeksen binnen
 * wanneer iemand hem uit het bestand kopieert. Zonder deze normalisatie faalt
 * het ondertekenen met een weinig zeggende OpenSSL-fout.
 */
export function normalisePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

/**
 * De live config, of `null` wanneer de koppeling niet (volledig) ingesteld is.
 *
 * Bewust `null` en geen throw: Google is een optionele integratie, precies zoals
 * de kluis, Brevo en de deur. Een site zonder ingevulde config hoort gewoon te
 * draaien met de sync uit, niet te crashen.
 */
export async function getGoogleConfig(): Promise<GoogleConfig | null> {
  let stored: StoredGoogle | null = null;
  try {
    const row = await prisma.setting.findUnique({ where: { key: GOOGLE_SETTING_KEY } });
    stored = (row?.value ?? null) as unknown as StoredGoogle | null;
  } catch {
    return null;
  }
  if (!stored?.domain || !stored.subject || !stored.clientEmail || !stored.privateKeyEnc) {
    return null;
  }

  let privateKey: string;
  try {
    privateKey = normalisePrivateKey(decryptSecret(stored.privateKeyEnc));
  } catch {
    // Een onleesbaar geheim betekent dat BETTER_AUTH_SECRET veranderd is. Dan is
    // de config niet half stuk maar helemaal, en moet iemand ze opnieuw invullen.
    return null;
  }
  if (!privateKey.includes("BEGIN")) return null;

  return {
    domain: stored.domain.toLowerCase(),
    subject: stored.subject.toLowerCase(),
    clientEmail: stored.clientEmail,
    privateKey,
  };
}

/** Wat het configuratiescherm mag tonen: nooit de sleutel zelf. */
export async function getGoogleStatus(): Promise<GoogleStatus> {
  let stored: StoredGoogle | null = null;
  try {
    const row = await prisma.setting.findUnique({ where: { key: GOOGLE_SETTING_KEY } });
    stored = (row?.value ?? null) as unknown as StoredGoogle | null;
  } catch {
    stored = null;
  }
  return {
    configured: Boolean(
      stored?.domain && stored.subject && stored.clientEmail && stored.privateKeyEnc,
    ),
    domain: stored?.domain ?? null,
    subject: stored?.subject ?? null,
    clientEmail: stored?.clientEmail ?? null,
    hasKey: Boolean(stored?.privateKeyEnc),
  };
}
