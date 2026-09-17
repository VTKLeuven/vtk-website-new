import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * De private voorverkooplink: wie hem heeft, koopt tijdens de voorverkoop mee,
 * zonder post en zonder shiften.
 *
 * Bedoeld voor een groep die de site niet kent, of die niet in een post te
 * vatten is: de band die komt spelen, de sponsors, de ouders van. Zonder deze
 * weg was de enige oplossing de verkoop vroeger openzetten voor iedereen.
 *
 * De link is het bewijs, dus hij moet te raden onmogelijk zijn: 32 hex-tekens
 * uit `randomBytes`. Hij hangt aan het event en niet aan een persoon, precies
 * omdat hij doorgestuurd mag worden; wie hem te breed deelt, regenereert hem en
 * de oude is meteen waardeloos.
 */

export function newPresaleToken(): string {
  return randomBytes(16).toString("hex");
}

/** Vergelijkt in constante tijd; een token is een geheim, geen id. */
export function presaleTokenMatches(stored: string | null, provided: string | null): boolean {
  if (!stored || !provided) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * De cookie die onthoudt dat deze bezoeker de link volgde, zodat hij de shop
 * kan herladen en afrekenen zonder de link opnieuw te openen. Per event, zoals
 * de toegangscookie van een bestelling.
 */
export function presaleCookieName(eventId: string): string {
  const suffix = createHash("sha256").update(eventId).digest("hex").slice(0, 24);
  return `vtk_presale_${suffix}`;
}

export function presaleCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Hoe lang de cookie leeft: tot de verkoop voor iedereen opengaat, want daarna
 * voegt ze niets meer toe. Zonder verkoopstart een dag, zodat ze niet blijft
 * plakken op een toestel waar iemand ooit de link opende.
 */
export function presaleCookieExpiry(salesStartAt: Date | null, now = new Date()): Date {
  const fallback = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (!salesStartAt) return fallback;
  return salesStartAt > now ? salesStartAt : fallback;
}
