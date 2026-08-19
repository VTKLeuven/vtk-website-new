import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACCESS_TTL_HOURS } from "./config";

/**
 * Bewijs dat iemand een geldige code heeft ingewisseld, als ondertekende cookie.
 *
 * Bewust geen rij in de database: de cookie draagt het adres en een vervaltijd
 * en is met HMAC ondertekend, dus de server hoeft niets te onthouden en er valt
 * niets op te ruimen. Zelfde patroon als `lib/forms/uploadToken.ts`.
 *
 * Intrekken gebeurt daarom niet per sessie maar per adres: haal het adres van de
 * lijst en de eerstvolgende download stuit op de controle in de route, want die
 * kijkt niet alleen naar de handtekening maar ook of het adres er nog op staat.
 */

const PREFIX = "vtk24ul1";

function secret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("BETTER_AUTH_SECRET ontbreekt");
    return configured;
  }
  return configured || "vtk-local-urenloop-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type AccessPayload = { email: string; exp: number };

export function createAccessToken(email: string): string {
  const payload: AccessPayload = {
    email,
    exp: Date.now() + ACCESS_TTL_HOURS * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${PREFIX}.${encoded}.${sign(`${PREFIX}.${encoded}`)}`;
}

/** Geeft het adres terug, of null bij elke twijfel. */
export function readAccessToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, encoded, signature] = parts;
  if (!safeEqual(signature, sign(`${PREFIX}.${encoded}`))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AccessPayload;
    if (typeof payload.email !== "string" || !payload.email) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return payload.email;
  } catch {
    return null;
  }
}

export async function setAccessCookie(email: string): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, createAccessToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL_HOURS * 60 * 60,
  });
}

export async function readAccessCookie(): Promise<string | null> {
  const store = await cookies();
  return readAccessToken(store.get(ACCESS_COOKIE)?.value);
}

export async function clearAccessCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
}
