import { createHmac } from "node:crypto";

/** HMAC over `METHODE\nPAD\nTIJDSTIP\nGEBRUIKER\nBODY`; zie `lib/vtk-app/signature.ts` bij cudi. */
export function signCudiRequest(input: {
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
