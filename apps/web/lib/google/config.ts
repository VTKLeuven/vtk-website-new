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
  /**
   * OAuth-client voor de zelfbedieningskoppeling ("Koppel je VTK-account").
   * Los van het service-account: dat is server-to-server, dit is een gewone
   * webclient waarmee een lid zich met zijn eigen account aanmeldt.
   */
  oauthClientId?: string;
  oauthClientSecretEnc?: string;
  /** OU voor een volwaardig account. Leeg = de wortel van het domein. */
  fullOrgUnit?: string;
  /**
   * Verplicht de koppelgate voor leden met een post of werkgroep. Standaard
   * **uit**: de koppeling opzetten mag nooit ongemerkt een melding op het scherm
   * van elk praesidiumlid zetten. Zet hem pas aan wanneer de OAuth-client werkt
   * en de accounts bestaan, anders klikt iedereen "ik heb nog geen account" en
   * heb je een week stilte gekocht zonder één koppeling.
   */
  linkGateEnabled?: boolean;
  /**
   * OU voor een kiesploegaccount zonder verzendrecht. Op die OU staat de
   * routing-regel die uitgaande mail vanaf het primaire adres weigert; die
   * regel is handwerk in de Admin console, want er is geen API voor. Leeg =
   * de sync verplaatst niemand.
   */
  restrictedOrgUnit?: string;
};

export type GoogleConfig = {
  domain: string;
  subject: string;
  clientEmail: string;
  /** PEM, met echte newlines. */
  privateKey: string;
  /** `null` wanneer de zelfbedieningskoppeling niet ingesteld is. */
  oauth: { clientId: string; clientSecret: string } | null;
  fullOrgUnit: string;
  /** `null` = geen beperkte OU ingesteld; de sync verplaatst dan niemand. */
  restrictedOrgUnit: string | null;
};

export type GoogleStatus = {
  configured: boolean;
  domain: string | null;
  subject: string | null;
  clientEmail: string | null;
  hasKey: boolean;
  oauthClientId: string | null;
  hasOauthSecret: boolean;
  /** Zonder OAuth-client kan een lid zichzelf niet koppelen. */
  linkingConfigured: boolean;
  /** Staat de verplichte koppelgate aan? Los van of ze technisch kan. */
  linkGateEnabled: boolean;
  fullOrgUnit: string | null;
  restrictedOrgUnit: string | null;
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

  let oauth: GoogleConfig["oauth"] = null;
  if (stored.oauthClientId && stored.oauthClientSecretEnc) {
    try {
      oauth = {
        clientId: stored.oauthClientId,
        clientSecret: decryptSecret(stored.oauthClientSecretEnc),
      };
    } catch {
      // Onleesbaar geheim: dan is enkel de koppelknop stuk, niet de hele sync.
      oauth = null;
    }
  }

  return {
    domain: stored.domain.toLowerCase(),
    subject: stored.subject.toLowerCase(),
    clientEmail: stored.clientEmail,
    privateKey,
    oauth,
    fullOrgUnit: stored.fullOrgUnit?.trim() || "/",
    restrictedOrgUnit: stored.restrictedOrgUnit?.trim() || null,
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
    oauthClientId: stored?.oauthClientId ?? null,
    hasOauthSecret: Boolean(stored?.oauthClientSecretEnc),
    linkingConfigured: Boolean(stored?.oauthClientId && stored.oauthClientSecretEnc),
    linkGateEnabled: Boolean(stored?.linkGateEnabled),
    fullOrgUnit: stored?.fullOrgUnit ?? null,
    restrictedOrgUnit: stored?.restrictedOrgUnit ?? null,
  };
}

// -----------------------------------------------------------------------------
// De koppelgate
// -----------------------------------------------------------------------------

type GateCache = { enabled: boolean; until: number };
let gateCache: GateCache | null = null;

/** Hoe lang de gate-stand gecachet blijft. Zie {@link googleLinkGateEnabled}. */
const GATE_TTL_MS = 60_000;

/**
 * Mag de koppelgate leden tegenhouden?
 *
 * Drie voorwaarden, en alle drie om dezelfde reden: **een gate die iets vraagt
 * wat niet kan, is een storing.** De integratie moet ingesteld zijn, er moet een
 * OAuth-client zijn (anders is er geen knop om op te duwen), en iemand moet de
 * gate bewust aangezet hebben.
 *
 * Dit draait in `proxy.ts` op elk verzoek van een ingelogd lid, dus het antwoord
 * wordt een minuut gecachet. Zet je de schakelaar om, dan duurt het hoogstens
 * zo lang voor iedereen het merkt; dat is ruim snel genoeg voor iets wat één
 * keer per jaar verandert.
 */
export async function googleLinkGateEnabled(): Promise<boolean> {
  const now = Date.now();
  if (gateCache && gateCache.until > now) return gateCache.enabled;

  let enabled = false;
  try {
    const row = await prisma.setting.findUnique({ where: { key: GOOGLE_SETTING_KEY } });
    const stored = (row?.value ?? null) as unknown as StoredGoogle | null;
    enabled = Boolean(
      stored?.linkGateEnabled &&
        stored.domain &&
        stored.subject &&
        stored.clientEmail &&
        stored.privateKeyEnc &&
        stored.oauthClientId &&
        stored.oauthClientSecretEnc,
    );
  } catch {
    // Geen database, geen gate. Een lid buitensluiten omdat wij niet konden
    // lezen of de gate aan staat, is het slechtste van twee werelden.
    enabled = false;
  }

  gateCache = { enabled, until: now + GATE_TTL_MS };
  return enabled;
}

/** Gooit de cache weg; gebruikt nadat de configuratie opgeslagen is. */
export function forgetGoogleGateState(): void {
  gateCache = null;
}
