import "server-only";

import type { VaultConfig } from "./config";
import {
  type CipherPayload,
  type RawCipher,
  createCipher,
  deleteCipher,
  listCiphers,
  updateCipher,
} from "./client";
import { decryptOptional, decryptString, encryptString, itemKey, newItemKey } from "./crypto";

/**
 * De laag tussen de admin en de kluis: hier gaat versleuteld in en leesbaar uit.
 *
 * Alles hierboven werkt met klare tekst, alles hieronder met EncStrings. Houd
 * die grens scherp: een klaartekstwachtwoord dat per ongeluk in `client.ts`
 * terechtkomt, staat onversleuteld in de kluis en valt niemand op tot een lid
 * het in de extensie als onleesbare rommel ziet.
 */

export type VaultItem = {
  id: string;
  name: string;
  username: string | null;
  /** Bewust apart op te vragen; een lijst hoort geen wachtwoorden mee te sturen. */
  password: string | null;
  uri: string | null;
  notes: string | null;
  revisionDate: Date | null;
};

export type VaultItemInput = {
  name: string;
  username?: string | null;
  password?: string | null;
  uri?: string | null;
  notes?: string | null;
};

/**
 * Ontsleutelt één item. Een item met een eigen sleutel (`key`) gebruikt die voor
 * zijn velden; anders gaan ze rechtstreeks op de organisatiesleutel.
 */
function decryptCipher(cfg: VaultConfig, raw: RawCipher, includePassword: boolean): VaultItem {
  const key = itemKey(cfg.orgKey, raw.key);
  return {
    id: raw.id,
    name: decryptString(key, raw.name),
    username: decryptOptional(key, raw.login?.username),
    password: includePassword ? decryptOptional(key, raw.login?.password) : null,
    uri: decryptOptional(key, raw.login?.uris?.[0]?.uri),
    notes: decryptOptional(key, raw.notes),
    revisionDate: raw.revisionDate ? new Date(raw.revisionDate) : null,
  };
}

function encryptItem(cfg: VaultConfig, input: VaultItemInput): CipherPayload {
  // Elk item krijgt een verse eigen sleutel, zoals de clients doen. Ook bij een
  // bewerking: dat is goedkoop en houdt oude ciphertext niet onder dezelfde
  // sleutel als de nieuwe.
  const fresh = newItemKey(cfg.orgKey);
  const enc = (value: string | null | undefined) =>
    value ? encryptString(fresh.key, value) : null;
  return {
    key: fresh.encrypted,
    name: encryptString(fresh.key, input.name),
    notes: enc(input.notes),
    username: enc(input.username),
    password: enc(input.password),
    uri: enc(input.uri),
  };
}

/**
 * De items van één post, zonder wachtwoorden. Dat is wat een lijstscherm nodig
 * heeft; het wachtwoord vraag je pas op wanneer iemand er echt om vraagt, zodat
 * het niet in elke pagina-render meegaat.
 */
export async function listVaultItems(
  cfg: VaultConfig,
  collectionId: string,
): Promise<VaultItem[]> {
  const all = await listCiphers(cfg);
  return all
    .filter((raw) => raw.collectionIds.includes(collectionId))
    .map((raw) => decryptCipher(cfg, raw, false))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

/** Eén item mét wachtwoord. De aanroeper logt dit; zie `lib/audit.ts`. */
export async function revealVaultItem(
  cfg: VaultConfig,
  collectionId: string,
  cipherId: string,
): Promise<VaultItem | null> {
  const all = await listCiphers(cfg);
  const raw = all.find((c) => c.id === cipherId && c.collectionIds.includes(collectionId));
  // De collectie-check is geen formaliteit: zonder haar zou een gepeuterd id uit
  // een formulier een wachtwoord van een andere post teruggeven.
  return raw ? decryptCipher(cfg, raw, true) : null;
}

export async function createVaultItem(
  cfg: VaultConfig,
  collectionId: string,
  input: VaultItemInput,
): Promise<string> {
  return createCipher(cfg, collectionId, encryptItem(cfg, input));
}

export async function updateVaultItem(
  cfg: VaultConfig,
  collectionId: string,
  cipherId: string,
  input: VaultItemInput,
): Promise<boolean> {
  const all = await listCiphers(cfg);
  const raw = all.find((c) => c.id === cipherId && c.collectionIds.includes(collectionId));
  if (!raw) return false;
  await updateCipher(cfg, cipherId, encryptItem(cfg, input));
  return true;
}

export async function deleteVaultItem(
  cfg: VaultConfig,
  collectionId: string,
  cipherId: string,
): Promise<boolean> {
  const all = await listCiphers(cfg);
  const raw = all.find((c) => c.id === cipherId && c.collectionIds.includes(collectionId));
  if (!raw) return false;
  await deleteCipher(cfg, cipherId);
  return true;
}
