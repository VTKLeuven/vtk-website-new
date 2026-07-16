import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Versleutelt gevoelige instellingen (bv. de S3-secret-key) die we in de
 * `Setting`-tabel bewaren, zodat ze niet leesbaar in de database staan. De
 * sleutel leiden we af van `BETTER_AUTH_SECRET`: die bestaat al en is een
 * hoog-entropie applicatiegeheim, dus er komt geen nieuwe env-variabele bij.
 *
 * Formaat: `v1:<iv>:<tag>:<ciphertext>` (elk deel base64). AES-256-GCM geeft
 * ook integriteit (de auth-tag), dus geknoei met de opgeslagen waarde faalt bij
 * het ontsleutelen i.p.v. stil verkeerde bytes terug te geven.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const master = process.env.BETTER_AUTH_SECRET;
  if (!master) {
    throw new Error(
      "BETTER_AUTH_SECRET ontbreekt: nodig om instellingen te (ont)versleutelen.",
    );
  }
  // Vaste salt: we willen een deterministische sleutel per master-secret, geen
  // per-waarde salt (dat hoort bij het ciphertext via de random IV).
  cachedKey = scryptSync(master, "vtk-settings-enc-v1", 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Onbekend secret-formaat.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
