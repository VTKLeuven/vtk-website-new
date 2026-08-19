import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@vtk/db";
import { CODE_MAX_ATTEMPTS, CODE_MAX_PER_HOUR, CODE_TTL_MINUTES } from "./config";

/**
 * Eenmalige codes voor de downloadpagina van de 24urenloop-app.
 *
 * Een code van zes cijfers heeft maar een miljoen mogelijkheden, dus twee dingen
 * moeten kloppen. Ten eerste wordt hij **gehasht met HMAC** en niet met een kale
 * SHA-256: van een kale hash bereken je de zes cijfers in een fractie van een
 * seconde terug, dus zou een leesbaar databasedump alle openstaande codes
 * meteen prijsgeven. Ten tweede is het aantal pogingen begrensd, anders raadt
 * een script de code ruim binnen het uur dat hij geldig is.
 */

function secret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("BETTER_AUTH_SECRET ontbreekt");
    return configured;
  }
  return configured || "vtk-local-urenloop-secret-change-me";
}

/** Het adres hoort bij de hash: dezelfde code voor een ander adres klopt dus niet. */
function hash(email: string, code: string): string {
  return createHmac("sha256", secret()).update(`${email}:${code}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Zes cijfers, uniform verdeeld; `randomInt` en niet `Math.random`. */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: "RATE_LIMITED" };

/**
 * Maakt een code aan voor een adres dat al op de lijst staat; de aanroeper
 * controleert dat. Oudere, nog openstaande codes van hetzelfde adres worden
 * ingetrokken, zodat er er nooit twee tegelijk geldig zijn: anders blijft een
 * code die per ongeluk bij de verkeerde persoon belandde naast de nieuwe leven.
 */
export async function issueCode(email: string): Promise<IssueResult> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const recent = await prisma.urenloopDownloadCode.count({
    where: { email, createdAt: { gte: hourAgo } },
  });
  if (recent >= CODE_MAX_PER_HOUR) return { ok: false, reason: "RATE_LIMITED" };

  const code = newCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.urenloopDownloadCode.updateMany({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.urenloopDownloadCode.create({
      data: { email, codeHash: hash(email, code), expiresAt },
    }),
  ]);

  return { ok: true, code, expiresAt };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "INVALID" | "TOO_MANY" };

/**
 * Wisselt een code in. Eén keer bruikbaar: `usedAt` wordt gezet, zodat een code
 * die in een doorgestuurde mail belandt niet een tweede keer werkt.
 *
 * Een fout adres en een foute code geven hetzelfde antwoord. Wie niet op de
 * lijst staat, hoort dat niet te kunnen afleiden uit het verschil.
 */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const now = new Date();
  const candidate = await prisma.urenloopDownloadCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) return { ok: false, reason: "INVALID" };

  if (candidate.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: "TOO_MANY" };

  if (!safeEqual(candidate.codeHash, hash(email, code.trim()))) {
    const { attempts } = await prisma.urenloopDownloadCode.update({
      where: { id: candidate.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return { ok: false, reason: attempts >= CODE_MAX_ATTEMPTS ? "TOO_MANY" : "INVALID" };
  }

  await prisma.urenloopDownloadCode.update({
    where: { id: candidate.id },
    data: { usedAt: now },
  });
  return { ok: true };
}

/**
 * Ruimt verlopen codes op. Draait bij elke aanvraag mee: het zijn er weinig, en
 * een eigen cron voor drie rijen per week is meer onderhoud dan het waard is.
 */
export async function pruneExpiredCodes(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.urenloopDownloadCode.deleteMany({ where: { expiresAt: { lt: cutoff } } });
}
