import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Een geüpload bestand bestaat al in de objectopslag voor het formulier
 * verzonden is; de browser krijgt enkel een ondertekende verwijzing terug en
 * stuurt die mee bij het indienen.
 *
 * De handtekening is het hele punt: zonder zou een bezoeker bij het indienen
 * een willekeurige `storageKey` kunnen opsturen en zo het bestand van iemand
 * anders aan zijn eigen inzending hangen.
 */

const PREFIX = "vtkfu1";

function secret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("BETTER_AUTH_SECRET ontbreekt");
    return configured;
  }
  return configured || "vtk-local-forms-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type UploadDescriptor = {
  formId: string;
  fieldId: string;
  storageKey: string;
  originalName: string;
  contentType: string | null;
  sizeBytes: number;
};

export function createUploadToken(descriptor: UploadDescriptor): string {
  const payload = Buffer.from(JSON.stringify(descriptor), "utf8").toString("base64url");
  return `${PREFIX}.${payload}.${sign(`${PREFIX}.${payload}`)}`;
}

/**
 * Leest een token terug. Geeft null bij elke twijfel: een ander formulier, een
 * ander veld, of een handtekening die niet klopt.
 */
export function verifyUploadToken(
  token: string,
  expected: { formId: string; fieldId?: string }
): UploadDescriptor | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payload, signature] = parts;
  if (!safeEqual(signature, sign(`${PREFIX}.${payload}`))) return null;

  try {
    const descriptor = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as UploadDescriptor;
    if (descriptor.formId !== expected.formId) return null;
    if (expected.fieldId && descriptor.fieldId !== expected.fieldId) return null;
    if (typeof descriptor.storageKey !== "string" || !descriptor.storageKey) return null;
    return descriptor;
  } catch {
    return null;
  }
}

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}
