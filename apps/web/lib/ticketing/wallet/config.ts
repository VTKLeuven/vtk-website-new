import "server-only";

export type AppleWalletConfig = {
  teamId: string;
  passTypeIdentifier: string;
  organizationName: string;
  signerCertPem: string;
  signerKeyPem: string;
  signerKeyPassphrase?: string;
  wwdrPem: string;
};

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: string;
};

/** PEM secrets don't survive as literal multi-line env values everywhere they
 * get deployed; accept the common `\n`-escaped single-line form too. */
function readPem(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

/** `null` (rather than throwing) whenever a piece is missing: the wallet
 * buttons simply don't render until every credential is in place, the same
 * way ticket mail silently no-ops without SMTP config in dev. */
export function appleWalletConfig(): AppleWalletConfig | null {
  const teamId = process.env.WALLET_APPLE_TEAM_ID?.trim();
  const passTypeIdentifier = process.env.WALLET_APPLE_PASS_TYPE_ID?.trim();
  const signerCertPem = readPem(process.env.WALLET_APPLE_SIGNER_CERT);
  const signerKeyPem = readPem(process.env.WALLET_APPLE_SIGNER_KEY);
  const wwdrPem = readPem(process.env.WALLET_APPLE_WWDR_CERT);
  if (!teamId || !passTypeIdentifier || !signerCertPem || !signerKeyPem || !wwdrPem) return null;
  return {
    teamId,
    passTypeIdentifier,
    organizationName: process.env.WALLET_APPLE_ORG_NAME?.trim() || "VTK Leuven",
    signerCertPem,
    signerKeyPem,
    signerKeyPassphrase: process.env.WALLET_APPLE_SIGNER_KEY_PASSPHRASE || undefined,
    wwdrPem,
  };
}

export function googleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = process.env.WALLET_GOOGLE_ISSUER_ID?.trim();
  const serviceAccountEmail = process.env.WALLET_GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = readPem(process.env.WALLET_GOOGLE_PRIVATE_KEY);
  if (!issuerId || !serviceAccountEmail || !privateKey) return null;
  return { issuerId, serviceAccountEmail, privateKey };
}

export type WalletWalletConfig = { apiKey: string };

/** Third-party fallback (walletwallet.dev): issues both Apple and Google
 * passes through their own already-Apple-registered signing identity, so VTK
 * doesn't need its own $99/year Apple Developer account. Trades that fee for
 * a recurring SaaS dependency and a pass technically issued through their
 * identity rather than VTK's own; see docs/design-decisions.md. When both
 * this and the direct Apple/Google config are set, the direct config wins
 * per platform (it's the one VTK fully owns). */
export function walletWalletConfig(): WalletWalletConfig | null {
  const apiKey = process.env.WALLET_WALLETWALLET_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey };
}
