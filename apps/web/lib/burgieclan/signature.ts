import { createHmac } from "node:crypto";

/**
 * De handtekening waarmee VTK namens een lid met de backend van Burgieclan praat.
 *
 * De app logt in met het sessiecookie van vtk.be en heeft dus geen token van
 * Burgieclan. In plaats van de app een tweede login te laten doen, spreekt
 * vtk.be zelf met Burgieclan, en zegt het in een ondertekende kop wie het lid
 * is. Burgieclan controleert dat in `VtkServiceAuthenticator` (zelfde schema,
 * andere kant; houd die twee gelijk).
 *
 * Ondertekend wordt `METHODE\nPAD\nTIJDSTIP\nGEBRUIKER\nBODY` met HMAC-SHA256 en
 * het gedeelde geheim: zo is een onderschepte aanvraag niet te hergebruiken voor
 * een ander pad, een andere gebruiker of een andere body, en na vijf minuten
 * helemaal niet meer. Hetzelfde stramien als de collab-server van Burgieclan
 * (`CollabRequestSignature`).
 *
 * Geen server-imports buiten `node:crypto`, zodat de test dit los kan draaien.
 */
export const HEADER_USER = "X-Vtk-User";
export const HEADER_TIMESTAMP = "X-Vtk-Timestamp";
export const HEADER_SIGNATURE = "X-Vtk-Signature";

/** Wie VTK zegt dat er vraagt, zoals Burgieclan een lid uit de SSO kent. */
export type BurgieclanIdentity = {
  /** De OIDC-`sub` die Burgieclan van VTK kreeg (zie `lib/burgieclan/subject.ts`). */
  sub: string;
  /** Het universitaire adres: de identiteitsclaim, niet het voorkeursadres. */
  email: string;
  name: string;
};

export function encodeIdentity(identity: BurgieclanIdentity): string {
  return Buffer.from(JSON.stringify(identity), "utf8").toString("base64url");
}

export function signBurgieclanRequest(input: {
  secret: string;
  method: string;
  path: string;
  timestamp: number;
  user: string;
  body: string;
}): string {
  const payload = [input.method.toUpperCase(), input.path, String(input.timestamp), input.user, input.body].join("\n");
  return `sha256=${createHmac("sha256", input.secret).update(payload).digest("hex")}`;
}

/** De drie koppen voor één aanvraag. */
export function burgieclanAuthHeaders(input: {
  secret: string;
  method: string;
  path: string;
  body: string;
  identity: BurgieclanIdentity;
  now?: number;
}): Record<string, string> {
  const timestamp = Math.floor((input.now ?? Date.now()) / 1000);
  const user = encodeIdentity(input.identity);
  return {
    [HEADER_USER]: user,
    [HEADER_TIMESTAMP]: String(timestamp),
    [HEADER_SIGNATURE]: signBurgieclanRequest({
      secret: input.secret,
      method: input.method,
      path: input.path,
      timestamp,
      user,
      body: input.body,
    }),
  };
}
