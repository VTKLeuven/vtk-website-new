import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * De link waarmee iemand zijn Discord-account aan zijn VTK-account koppelt.
 *
 * Discord vertelt ons welk account op de knop drukte; deze ondertekende link
 * draagt dat mee naar de site, waar de student met zijn VTK-account aangemeld
 * is. Een kwartier geldig, even lang als het bericht waarin hij staat.
 */
const VALID_MS = 15 * 60 * 1000;

function secret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("BETTER_AUTH_SECRET ontbreekt");
    return configured;
  }
  return configured || "vtk-local-discord-link-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`vtk-discord-link:v1:${payload}`).digest("base64url");
}

export function createDiscordLinkToken(discordId: string, username: string, now: Date = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ d: discordId, u: username, e: now.getTime() + VALID_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readDiscordLinkToken(
  token: string,
  now: Date = new Date(),
): { discordId: string; username: string } | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { d, u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof d !== "string" || typeof u !== "string" || typeof e !== "number" || e < now.getTime()) return null;
    return { discordId: d, username: u };
  } catch {
    return null;
  }
}
