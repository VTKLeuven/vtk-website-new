import { createPublicKey, verify } from "node:crypto";

/**
 * Komt een verzoek echt van Discord? Elke interactie is ondertekend met de
 * sleutel van de applicatie, over het tijdstip gevolgd door de ruwe body.
 *
 * Node kent enkel sleutels in een omslag; Discord geeft de ruwe 32 bytes. Het
 * voorvoegsel hieronder is die vaste omslag (SPKI) voor Ed25519.
 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(input: {
  publicKeyHex: string;
  signatureHex: string | null;
  timestamp: string | null;
  body: string;
}): boolean {
  const { publicKeyHex, signatureHex, timestamp, body } = input;
  if (!signatureHex || !timestamp || !/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) return false;
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
    format: "der",
    type: "spki",
  });
  return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
}
