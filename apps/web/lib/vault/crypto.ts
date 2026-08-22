import "server-only";

import {
  constants as cryptoConstants,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  pbkdf2Sync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Het Bitwarden-formaat, in Node.
 *
 * Vaultwarden bewaart enkel versleutelde blobs; alle crypto gebeurt in de
 * client. Omdat wij de wachtwoorden óók vanuit de admin willen beheren, is de
 * admin hier zo'n client: we schrijven precies het formaat dat de
 * browser-extensie en de mobiele apps al lezen. Dat is een klein, gedocumenteerd
 * formaat, dus dit bestand heeft geen enkele dependency buiten `node:crypto`.
 *
 * Twee dingen om te onthouden voor je hier iets wijzigt:
 *
 * - Een sleutel is **64 bytes**, niet 32: de eerste helft versleutelt, de tweede
 *   helft ondertekent. Wie ze als één AES-sleutel behandelt, krijgt data die
 *   niemand meer kan lezen en pas maanden later een klacht.
 * - Moderne clients geven elk item een **eigen sleutel** (`cipher.key`), die
 *   zelf met de organisatiesleutel versleuteld is. Sla dat niveau over en de
 *   clients tonen een leeg item zonder foutmelding.
 *
 * Zie `docs/wachtwoorden.md` voor het grotere geheel.
 */

// -----------------------------------------------------------------------------
// EncString
// -----------------------------------------------------------------------------

/**
 * De types die in het veld voorkomen. Wij schrijven altijd 2 (symmetrisch) en 4
 * (asymmetrisch); de rest staat er om oudere data te kunnen lezen.
 */
export const ENC_TYPE = {
  AES_CBC256_B64: 0,
  AES_CBC128_HMAC_SHA256_B64: 1,
  AES_CBC256_HMAC_SHA256_B64: 2,
  RSA_OAEP_SHA256_B64: 3,
  RSA_OAEP_SHA1_B64: 4,
} as const;

/** Lengte van een volledige symmetrische sleutel: 32 bytes encrypt + 32 bytes MAC. */
export const KEY_BYTES = 64;

export type EncString = string;

function splitKey(key: Buffer): { encKey: Buffer; macKey: Buffer } {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Sleutel moet ${KEY_BYTES} bytes zijn, kreeg ${key.length}.`);
  }
  return { encKey: key.subarray(0, 32), macKey: key.subarray(32, 64) };
}

/**
 * Versleutelt bytes tot `2.<iv>|<ct>|<mac>`. De MAC dekt `iv || ct`, niet enkel
 * de ciphertext: dat is wat de clients verifiëren, dus een andere volgorde
 * levert data op die overal elders afgekeurd wordt.
 */
export function encryptBytes(key: Buffer, data: Buffer): EncString {
  const { encKey, macKey } = splitKey(key);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", encKey, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const mac = createHmac("sha256", macKey).update(iv).update(ct).digest();
  return `${ENC_TYPE.AES_CBC256_HMAC_SHA256_B64}.${iv.toString("base64")}|${ct.toString(
    "base64",
  )}|${mac.toString("base64")}`;
}

export function encryptString(key: Buffer, plaintext: string): EncString {
  return encryptBytes(key, Buffer.from(plaintext, "utf8"));
}

/**
 * Ontsleutelt een symmetrische EncString. Een verkeerde MAC gooit; dat is
 * bewust, want het betekent ofwel een verkeerde sleutel ofwel geknoei, en in
 * beide gevallen is doorgaan met de bytes erger dan stoppen.
 */
export function decryptBytes(key: Buffer, value: EncString): Buffer {
  const dot = value.indexOf(".");
  if (dot < 0) throw new Error("Ongeldige EncString: geen type-prefix.");
  const type = Number(value.slice(0, dot));
  const parts = value.slice(dot + 1).split("|");

  if (type === ENC_TYPE.AES_CBC256_HMAC_SHA256_B64) {
    const [ivB64, ctB64, macB64] = parts;
    if (!ivB64 || !ctB64 || !macB64) throw new Error("Ongeldige EncString van type 2.");
    const { encKey, macKey } = splitKey(key);
    const iv = Buffer.from(ivB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const expected = createHmac("sha256", macKey).update(iv).update(ct).digest();
    const actual = Buffer.from(macB64, "base64");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error("EncString heeft een ongeldige MAC.");
    }
    const decipher = createDecipheriv("aes-256-cbc", encKey, iv);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  if (type === ENC_TYPE.AES_CBC256_B64) {
    // Legacy, zonder MAC. Wij schrijven dit niet meer, maar oude items kunnen
    // het nog hebben.
    const [ivB64, ctB64] = parts;
    if (!ivB64 || !ctB64) throw new Error("Ongeldige EncString van type 0.");
    const decipher = createDecipheriv(
      "aes-256-cbc",
      key.subarray(0, 32),
      Buffer.from(ivB64, "base64"),
    );
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  }

  throw new Error(`EncString-type ${type} is niet symmetrisch te ontsleutelen.`);
}

export function decryptString(key: Buffer, value: EncString): string {
  return decryptBytes(key, value).toString("utf8");
}

/**
 * Ontsleutelt een veld dat leeg mag zijn. De API geeft voor een niet-ingevuld
 * veld `null` terug, en dat is geen fout.
 */
export function decryptOptional(key: Buffer, value: EncString | null | undefined): string | null {
  if (!value) return null;
  return decryptString(key, value);
}

// -----------------------------------------------------------------------------
// Asymmetrisch: de organisatiesleutel naar een lid
// -----------------------------------------------------------------------------

/**
 * Versleutelt bytes met de publieke sleutel van een lid (`4.<base64>`,
 * RSA-OAEP-SHA1). Dit is de enige plek waar we asymmetrisch werken: bij het
 * bevestigen van een nieuw organisatielid krijgt die zo de organisatiesleutel.
 *
 * SHA-1 ziet er verkeerd uit maar is hier correct: het is de OAEP-hash die alle
 * Bitwarden-clients voor type 4 verwachten. Het is geen handtekening, dus de
 * collision-zwakte van SHA-1 speelt niet mee.
 */
export function rsaEncrypt(publicKeyDer: Buffer, data: Buffer): EncString {
  const key = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
  const ct = publicEncrypt(
    { key, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" },
    data,
  );
  return `${ENC_TYPE.RSA_OAEP_SHA1_B64}.${ct.toString("base64")}`;
}

export function rsaDecrypt(privateKeyDer: Buffer, value: EncString): Buffer {
  const dot = value.indexOf(".");
  const type = Number(value.slice(0, dot));
  const ct = Buffer.from(value.slice(dot + 1).split("|")[0], "base64");
  const key = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  const oaepHash =
    type === ENC_TYPE.RSA_OAEP_SHA256_B64
      ? "sha256"
      : type === ENC_TYPE.RSA_OAEP_SHA1_B64
        ? "sha1"
        : null;
  if (!oaepHash) throw new Error(`EncString-type ${type} is niet asymmetrisch te ontsleutelen.`);
  return privateDecrypt(
    { key, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash },
    ct,
  );
}

// -----------------------------------------------------------------------------
// Sleutels
// -----------------------------------------------------------------------------

/** Een verse symmetrische sleutel (organisatie, gebruiker of één item). */
export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/**
 * Een RSA-sleutelpaar voor een account, in de vorm die de API verwacht: de
 * publieke sleutel als SPKI-DER in base64, de private sleutel als PKCS8-DER
 * versleuteld met de sleutel van de gebruiker.
 */
export function generateKeyPair(userKey: Buffer): {
  publicKey: string;
  encryptedPrivateKey: EncString;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  return {
    publicKey: spki.toString("base64"),
    encryptedPrivateKey: encryptBytes(userKey, pkcs8),
  };
}

// -----------------------------------------------------------------------------
// Master password
// -----------------------------------------------------------------------------

/**
 * De KDF-parameters van een account, zoals `/identity/accounts/prelogin` ze
 * teruggeeft. Wij ondersteunen bewust enkel PBKDF2: Argon2id zou een native
 * binding toevoegen, en die zijn in deze monorepo precies het soort dependency
 * dat de lockfile stuk maakt (zie AGENTS.md). Zet het botaccount dus op PBKDF2.
 */
export type KdfParams = { kdf: number; iterations: number };

export const KDF_PBKDF2 = 0;
export const DEFAULT_KDF_ITERATIONS = 600_000;

/** HKDF-Expand (RFC 5869) zonder extract-stap; dat is wat Bitwarden gebruikt. */
function hkdfExpand(prk: Buffer, info: string, length: number): Buffer {
  const out: Buffer[] = [];
  let previous = Buffer.alloc(0);
  for (let i = 1; out.reduce((n, b) => n + b.length, 0) < length; i += 1) {
    previous = createHmac("sha256", prk)
      .update(previous)
      .update(Buffer.from(info, "utf8"))
      .update(Buffer.from([i]))
      .digest();
    out.push(previous);
  }
  return Buffer.concat(out).subarray(0, length);
}

/**
 * Master key uit het master password. De salt is het **e-mailadres**, in
 * kleine letters en getrimd; een hoofdletter erin geeft een andere sleutel en
 * dus een login die weigert zonder te zeggen waarom.
 */
export function deriveMasterKey(password: string, email: string, kdf: KdfParams): Buffer {
  if (kdf.kdf !== KDF_PBKDF2) {
    throw new Error(
      `KDF ${kdf.kdf} wordt niet ondersteund; zet het account op PBKDF2 (zie docs/wachtwoorden.md).`,
    );
  }
  return pbkdf2Sync(password, email.trim().toLowerCase(), kdf.iterations, 32, "sha256");
}

/** Wat als "wachtwoord" naar de server gaat: één PBKDF2-ronde over de master key. */
export function masterPasswordHash(masterKey: Buffer, password: string): string {
  return pbkdf2Sync(masterKey, password, 1, 32, "sha256").toString("base64");
}

/**
 * De 64-byte sleutel waarmee de user key versleuteld is. De master key zelf is
 * 32 bytes en heeft geen MAC-helft; die wordt hieruit gerekt.
 */
export function stretchMasterKey(masterKey: Buffer): Buffer {
  return Buffer.concat([hkdfExpand(masterKey, "enc", 32), hkdfExpand(masterKey, "mac", 32)]);
}

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------

/**
 * De sleutel waarmee de velden van één item versleuteld zijn. Heeft het item een
 * eigen sleutel, dan zit die versleuteld in `key` en gebruiken we die; anders
 * gaan de velden rechtstreeks op de organisatiesleutel.
 */
export function itemKey(orgKey: Buffer, encryptedItemKey: EncString | null | undefined): Buffer {
  if (!encryptedItemKey) return orgKey;
  return decryptBytes(orgKey, encryptedItemKey);
}

/**
 * Een verse sleutel voor een item, plus die sleutel versleuteld met de
 * organisatiesleutel. We geven elk item er één, zoals de clients doen: dan
 * hoeft een sleutelrotatie later niet elk veld van elk item aan te raken.
 */
export function newItemKey(orgKey: Buffer): { key: Buffer; encrypted: EncString } {
  const key = generateKey();
  return { key, encrypted: encryptBytes(orgKey, key) };
}
