import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_KDF_ITERATIONS,
  KDF_PBKDF2,
  decryptBytes,
  decryptOptional,
  decryptString,
  deriveMasterKey,
  encryptBytes,
  encryptString,
  generateKey,
  generateKeyPair,
  itemKey,
  masterPasswordHash,
  newItemKey,
  rsaDecrypt,
  rsaEncrypt,
  stretchMasterKey,
} from '@/lib/vault/crypto';

/**
 * Een round-trip tegen jezelf bewijst weinig: encrypt en decrypt kunnen samen
 * dezelfde fout maken (de klassieker is de MAC over `ct` in plaats van over
 * `iv || ct`). Daarom staan hier twee onafhankelijke ankers naast de
 * round-trips:
 *
 * - **openssl** ontsleutelt onze ciphertext en herrekent de MAC. Dat toetst de
 *   byte-indeling aan de spec en niet aan onze eigen code.
 * - De **master password hash** hieronder is precies de waarde die een echte
 *   Vaultwarden 1.35.1 aanvaardde bij registratie en login van het botaccount.
 *   De server herrekent die zelf, dus dit is een cross-implementatie-vector
 *   voor de hele PBKDF2-keten inclusief de salt-behandeling.
 */

const PASSWORD = 'correct-horse-battery-staple-42';
const EMAIL = 'vault-bot@vtk.be';
const ACCEPTED_BY_VAULTWARDEN = 'lwraTNK1LDQz5BqEdy0Z8OlhKYJlxeEyAfmcrx1cMIU=';

describe('EncString', () => {
  it('rondt tekst heen en terug', () => {
    const key = generateKey();
    expect(decryptString(key, encryptString(key, 'hunter2'))).toBe('hunter2');
  });

  it('overleeft accenten en emoji', () => {
    const key = generateKey();
    const value = 'wachtwoord met éàü en 🔐';
    expect(decryptString(key, encryptString(key, value))).toBe(value);
  });

  it('rondt lege tekst heen en terug', () => {
    const key = generateKey();
    expect(decryptString(key, encryptString(key, ''))).toBe('');
  });

  it('schrijft type 2 met drie delen', () => {
    const enc = encryptString(generateKey(), 'x');
    expect(enc.startsWith('2.')).toBe(true);
    expect(enc.split('|')).toHaveLength(3);
  });

  it('gebruikt elke keer een andere IV', () => {
    const key = generateKey();
    expect(encryptString(key, 'zelfde')).not.toBe(encryptString(key, 'zelfde'));
  });

  it('weigert een gewijzigde ciphertext', () => {
    const key = generateKey();
    const [head, ct, mac] = encryptString(key, 'hunter2').split('|');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    expect(() => decryptString(key, `${head}|${flipped.toString('base64')}|${mac}`)).toThrow(
      /MAC/,
    );
  });

  it('weigert een verkeerde sleutel', () => {
    const enc = encryptString(generateKey(), 'hunter2');
    expect(() => decryptString(generateKey(), enc)).toThrow(/MAC/);
  });

  it('weigert een sleutel die geen 64 bytes is', () => {
    expect(() => encryptString(Buffer.alloc(32), 'x')).toThrow(/64 bytes/);
  });

  it('laat een leeg veld leeg in plaats van te gooien', () => {
    const key = generateKey();
    expect(decryptOptional(key, null)).toBeNull();
    expect(decryptOptional(key, undefined)).toBeNull();
    expect(decryptOptional(key, encryptString(key, 'wel iets'))).toBe('wel iets');
  });
});

describe('formaat tegen openssl', () => {
  const key = generateKey();
  const plaintext = 'onafhankelijk te controleren';
  const enc = encryptString(key, plaintext);
  const [typeAndIv, ctB64, macB64] = enc.split('|');
  const iv = Buffer.from(typeAndIv.slice(typeAndIv.indexOf('.') + 1), 'base64');
  const ct = Buffer.from(ctB64, 'base64');

  it('is AES-256-CBC met de eerste 32 bytes van de sleutel', () => {
    const out = execFileSync(
      'openssl',
      ['enc', '-d', '-aes-256-cbc', '-K', key.subarray(0, 32).toString('hex'), '-iv', iv.toString('hex')],
      { input: ct },
    );
    expect(out.toString('utf8')).toBe(plaintext);
  });

  it('MACt iv || ct met de laatste 32 bytes van de sleutel', () => {
    const mac = execFileSync(
      'openssl',
      ['dgst', '-sha256', '-mac', 'HMAC', '-macopt', `hexkey:${key.subarray(32).toString('hex')}`, '-binary'],
      { input: Buffer.concat([iv, ct]) },
    );
    expect(mac.toString('base64')).toBe(macB64);
  });
});

describe('master password', () => {
  it('geeft de hash die Vaultwarden aanvaardde', () => {
    const masterKey = deriveMasterKey(PASSWORD, EMAIL, {
      kdf: KDF_PBKDF2,
      iterations: DEFAULT_KDF_ITERATIONS,
    });
    expect(masterPasswordHash(masterKey, PASSWORD)).toBe(ACCEPTED_BY_VAULTWARDEN);
  });

  it('negeert hoofdletters en spaties in het adres', () => {
    const kdf = { kdf: KDF_PBKDF2, iterations: 10_000 };
    const a = deriveMasterKey(PASSWORD, '  Vault-Bot@VTK.be ', kdf);
    const b = deriveMasterKey(PASSWORD, 'vault-bot@vtk.be', kdf);
    expect(a.equals(b)).toBe(true);
  });

  it('rekt de master key tot een sleutel met een MAC-helft', () => {
    const masterKey = deriveMasterKey(PASSWORD, EMAIL, { kdf: KDF_PBKDF2, iterations: 10_000 });
    const stretched = stretchMasterKey(masterKey);
    expect(stretched).toHaveLength(64);
    // De twee helften moeten echt verschillen; anders is HKDF fout aangeroepen.
    expect(stretched.subarray(0, 32).equals(stretched.subarray(32))).toBe(false);
    // En de sleutel is bruikbaar, wat een 64-byte-controle alleen niet aantoont.
    expect(decryptString(stretched, encryptString(stretched, 'ok'))).toBe('ok');
  });

  it('weigert een KDF die we niet ondersteunen', () => {
    expect(() => deriveMasterKey(PASSWORD, EMAIL, { kdf: 1, iterations: 3 })).toThrow(/PBKDF2/);
  });
});

describe('sleutelpaar en organisatiesleutel', () => {
  it('wrapt de organisatiesleutel naar een publieke sleutel en terug', () => {
    const userKey = generateKey();
    const pair = generateKeyPair(userKey);
    const privateDer = decryptBytes(userKey, pair.encryptedPrivateKey);
    const orgKey = generateKey();

    const wrapped = rsaEncrypt(Buffer.from(pair.publicKey, 'base64'), orgKey);
    expect(wrapped.startsWith('4.')).toBe(true);
    expect(rsaDecrypt(privateDer, wrapped).equals(orgKey)).toBe(true);
  });
});

describe('item-sleutels', () => {
  it('valt terug op de organisatiesleutel als een item er geen heeft', () => {
    const orgKey = generateKey();
    expect(itemKey(orgKey, null).equals(orgKey)).toBe(true);
    expect(itemKey(orgKey, undefined).equals(orgKey)).toBe(true);
  });

  it('ontsleutelt de eigen sleutel van een item', () => {
    const orgKey = generateKey();
    const fresh = newItemKey(orgKey);
    expect(itemKey(orgKey, fresh.encrypted).equals(fresh.key)).toBe(true);
    expect(fresh.key.equals(orgKey)).toBe(false);
  });

  it('leest een veld dat met de item-sleutel versleuteld is', () => {
    const orgKey = generateKey();
    const fresh = newItemKey(orgKey);
    const field = encryptString(fresh.key, 'hunter2');
    expect(decryptString(itemKey(orgKey, fresh.encrypted), field)).toBe('hunter2');
    // En niet met de organisatiesleutel: dat zou betekenen dat de item-sleutel
    // genegeerd wordt.
    expect(() => decryptString(orgKey, field)).toThrow();
  });
});

describe('bytes', () => {
  it('rondt willekeurige bytes heen en terug', () => {
    const key = generateKey();
    const data = generateKey();
    expect(decryptBytes(key, encryptBytes(key, data)).equals(data)).toBe(true);
  });
});
