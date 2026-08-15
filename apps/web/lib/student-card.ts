import "server-only";
import { prisma } from "@vtk/db";
import { verifyStudentCard } from "./kul-card";

/**
 * Kaart -> r-nummer, met de `StudentCard`-tabel als cache voor KU Leuven.
 *
 * Elke kaartlezer bij ons (Theokot-balie, de deur, de fakscanner aan de bar) leest
 * dezelfde string: `serial;cardAppId`. Die koppeling verandert niet meer zolang de
 * kaart bestaat, dus na de eerste geslaagde verificatie bewaren we ze en hoeft er
 * geen KU Leuven-call meer aan te pas te komen. Dat scheelt niet enkel tijd aan de
 * balie: het houdt de lezers ook werkend wanneer `account.kuleuven.be` er even uit
 * ligt, zolang de kaart al eens gescand is.
 *
 * Gebruik dit in plaats van {@link verifyStudentCard} rechtstreeks; die blijft de
 * onderliggende netwerkstap.
 */

export type ResolvedCard =
  | {
      ok: true;
      rNumber: string;
      firstName: string;
      lastName: string;
      /** Kwam dit uit onze eigen tabel of van KU Leuven? Enkel voor logging. */
      source: "cache" | "kuleuven";
    }
  | { ok: false; error: string };

/** Splitst wat de lezer typt; whitespace en newlines van de lezer gaan eraf. */
export function parseScannedCard(scanned: string): { serial: string; cardAppId: string } | null {
  const cleaned = scanned.replace(/[\r\n]+/g, "").trim();
  const [serial, cardAppId, ...rest] = cleaned.split(";");
  if (!serial || !cardAppId || rest.length > 0) return null;
  return { serial, cardAppId };
}

/** De naam op de kaart, of null wanneer KU Leuven er geen meegaf. */
export function cardDisplayName(card: { firstName: string; lastName: string }): string | null {
  return [card.firstName, card.lastName].filter(Boolean).join(" ") || null;
}

/**
 * Zoekt het r-nummer bij een gescande kaart: eerst in onze eigen tabel, en enkel
 * bij een onbekende kaart bij KU Leuven. Een geslaagde verificatie wordt bewaard,
 * een gekende kaart krijgt enkel zijn `lastSeenAt` bijgewerkt.
 */
export async function resolveStudentCard(scanned: string): Promise<ResolvedCard> {
  const parsed = parseScannedCard(scanned);
  if (!parsed) return { ok: false, error: "Ongeldige scan (verwacht serial;cardAppId)." };
  const { serial, cardAppId } = parsed;

  const known = await prisma.studentCard.findUnique({
    where: { serial_cardAppId: { serial, cardAppId } },
  });
  if (known) {
    // Bijhouden wanneer een kaart voor het laatst gezien is, maar de scan niet
    // laten falen als dat schrijven misgaat: de lezer wacht erop.
    await prisma.studentCard
      .update({
        where: { serial_cardAppId: { serial, cardAppId } },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => null);
    return {
      ok: true,
      rNumber: known.rNumber,
      firstName: known.firstName ?? "",
      lastName: known.lastName ?? "",
      source: "cache",
    };
  }

  const verified = await verifyStudentCard(scanned);
  if (!verified.ok) return verified;

  await prisma.studentCard
    .upsert({
      where: { serial_cardAppId: { serial, cardAppId } },
      create: {
        serial,
        cardAppId,
        rNumber: verified.rNumber,
        firstName: verified.firstName || null,
        lastName: verified.lastName || null,
      },
      update: {
        rNumber: verified.rNumber,
        firstName: verified.firstName || null,
        lastName: verified.lastName || null,
        lastSeenAt: new Date(),
      },
    })
    .catch(() => null);

  return {
    ok: true,
    rNumber: verified.rNumber,
    firstName: verified.firstName,
    lastName: verified.lastName,
    source: "kuleuven",
  };
}
