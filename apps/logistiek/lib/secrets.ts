import 'server-only';
import { createDecipheriv, scryptSync } from 'node:crypto';

/**
 * Ontsleutelt gevoelige instellingen (bv. de S3-secret-key) uit de
 * `Setting`-tabel. Identiek aan apps/web/lib/secrets.ts zodat logistiek leest
 * wat de web-admin schreef; de sleutel komt uit `BETTER_AUTH_SECRET`.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const master = process.env.BETTER_AUTH_SECRET;
  if (!master) {
    throw new Error('BETTER_AUTH_SECRET ontbreekt: nodig om instellingen te ontsleutelen.');
  }
  cachedKey = scryptSync(master, 'vtk-settings-enc-v1', 32);
  return cachedKey;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Onbekend secret-formaat.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
