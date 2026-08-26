import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";

/**
 * "Ik kom naar dit evenement": de teller op de site, en de namenlijst bij een
 * alumni-evenement.
 *
 * Dit is bewust **geen inschrijving**. Er hangt geen plaats aan, geen betaling
 * en geen ticket; het is een intentie, en de enige reden dat we ze tonen is dat
 * mensen makkelijker naar iets komen waarvan ze zien dat er al volk naartoe gaat.
 * De ster in de app (`lib/app-api/interest.ts`) is precies hetzelfde ding en
 * schrijft in dezelfde tabel: wie in de app op de ster tikt, telt hier mee.
 *
 * Twee wegen naar binnen, met opzet ongelijk:
 *
 * - **Ingelogd** kan overal. Eén account telt één keer, en niemand ziet wie het
 *   aanduidde tenzij hij dat bij een alumni-evenement zelf aanvinkt.
 * - **Zonder account** kan enkel bij een **alumni-evenement**, en enkel door
 *   iets over jezelf te zeggen (afstudeerjaar, of dat je in VTK zat, of allebei;
 *   de naam mag je weglaten). Een afgestudeerde van 2004 heeft geen KU Leuven-
 *   login meer, en die groep is net wie we willen bereiken. De prijs is dat die
 *   teller niet waterdicht is; een cookie houdt dubbele klikken van hetzelfde
 *   toestel tegen, meer niet.
 */

/**
 * Vanaf hoeveel geïnteresseerden de teller publiek verschijnt.
 *
 * Onder deze drempel zegt een getal het verkeerde: "3 mensen komen" leest als
 * "hier komt niemand" en houdt precies de mensen weg die je wilde overtuigen.
 * Boven de drempel keert dat om en werkt het als aanmoediging. Dertig is de
 * grens die de kring koos; zie docs/design-decisions.md.
 */
export const INTEREST_PUBLIC_THRESHOLD = 30;

/** Naam van het cookie waarmee een bezoeker zonder account zijn keuze terugneemt. */
const GUEST_COOKIE = "vtk_alumni_gast";
const GUEST_COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // browsers kappen langer toch af

function hashDevice(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Het apparaat-geheim uit het cookie, of `null` wanneer er nog geen is. */
export async function readGuestDeviceHash(): Promise<string | null> {
  const secret = (await cookies()).get(GUEST_COOKIE)?.value;
  return secret ? hashDevice(secret) : null;
}

/**
 * Het apparaat-geheim, en zet er een wanneer het nog niet bestaat. Enkel te
 * gebruiken vanuit een server action of route handler: elders is de cookiejar
 * alleen-lezen.
 */
export async function ensureGuestDeviceHash(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing) return hashDevice(existing);

  const secret = randomBytes(32).toString("base64url");
  jar.set(GUEST_COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
  return hashDevice(secret);
}

/**
 * Het aantal geïnteresseerden per evenement, maar enkel waar het de drempel
 * haalt. Een evenement dat er niet in zit, toont geen teller; de oproeper hoeft
 * de drempel dus niet zelf te kennen.
 */
export async function publicInterestCounts(
  eventIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (eventIds.length === 0) return counts;

  const [members, guests] = await Promise.all([
    prisma.calendarEventInterest.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
    prisma.calendarEventGuestInterest.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
  ]);

  const total = new Map<string, number>();
  for (const row of members) total.set(row.eventId, row._count._all);
  for (const row of guests) {
    total.set(row.eventId, (total.get(row.eventId) ?? 0) + row._count._all);
  }
  for (const [eventId, value] of total) {
    if (value >= INTEREST_PUBLIC_THRESHOLD) counts.set(eventId, value);
  }
  return counts;
}

/** Het totaal voor één evenement, ook onder de drempel (voor de eigen knop). */
export async function interestTotal(eventId: string): Promise<number> {
  const [members, guests] = await Promise.all([
    prisma.calendarEventInterest.count({ where: { eventId } }),
    prisma.calendarEventGuestInterest.count({ where: { eventId } }),
  ]);
  return members + guests;
}

/** Draagt dit evenement de alumni-doelgroep? Alleen dan mag iemand zonder account meedoen. */
export async function eventIsForAlumni(eventId: string): Promise<boolean> {
  const count = await prisma.calendarEvent.count({
    where: { id: eventId, categories: { some: { category: { audience: "ALUMNI" } } } },
  });
  return count > 0;
}

export type AttendeeRow = {
  key: string;
  /** `null` = deze persoon toont zijn naam niet. */
  name: string | null;
  graduationYear: number | null;
  wasInVtk: boolean;
};

/**
 * De publieke aanwezigheidslijst van een alumni-evenement.
 *
 * Enkel wie zelf iets aanvinkte staat erin. Een lid dat gewoon "ik kom" duidde
 * zonder één van de drie vakjes, telt wel mee in de teller maar krijgt geen rij:
 * dat onderscheid is de hele reden dat de vlaggen per evenement en niet per
 * profiel staan.
 */
export async function attendeeList(eventId: string): Promise<AttendeeRow[]> {
  const [members, guests] = await Promise.all([
    prisma.calendarEventInterest.findMany({
      where: {
        eventId,
        OR: [{ showName: true }, { showGraduationYear: true }, { showWasInVtk: true }],
      },
      select: {
        id: true,
        showName: true,
        showGraduationYear: true,
        showWasInVtk: true,
        createdAt: true,
        user: { select: { name: true, graduationYear: true, wasInVtk: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.calendarEventGuestInterest.findMany({
      where: { eventId },
      select: {
        id: true,
        displayName: true,
        graduationYear: true,
        wasInVtk: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rows: Array<AttendeeRow & { at: Date }> = [
    ...members.map((row) => ({
      key: `m-${row.id}`,
      name: row.showName ? row.user.name : null,
      graduationYear: row.showGraduationYear ? row.user.graduationYear : null,
      wasInVtk: row.showWasInVtk ? row.user.wasInVtk : false,
      at: row.createdAt,
    })),
    ...guests.map((row) => ({
      key: `g-${row.id}`,
      name: row.displayName,
      graduationYear: row.graduationYear,
      wasInVtk: row.wasInVtk,
      at: row.createdAt,
    })),
  ];

  // Wie enkel "ik zat niet in VTK en zeg verder niets" achterliet, levert een
  // lege rij op; die hoort er niet in te staan.
  return rows
    .filter((row) => row.name !== null || row.graduationYear !== null || row.wasInVtk)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((row) => ({
      key: row.key,
      name: row.name,
      graduationYear: row.graduationYear,
      wasInVtk: row.wasInVtk,
    }));
}

/** Wat de bezoeker zelf al aanduidde bij dit evenement. */
export type ViewerInterest =
  | { kind: "none" }
  | {
      kind: "member";
      showName: boolean;
      showGraduationYear: boolean;
      showWasInVtk: boolean;
    }
  | { kind: "guest"; displayName: string | null; graduationYear: number | null; wasInVtk: boolean };

export async function viewerInterest(
  eventId: string,
  userId: string | null,
): Promise<ViewerInterest> {
  if (userId) {
    const row = await prisma.calendarEventInterest.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { showName: true, showGraduationYear: true, showWasInVtk: true },
    });
    return row ? { kind: "member", ...row } : { kind: "none" };
  }

  const deviceHash = await readGuestDeviceHash();
  if (!deviceHash) return { kind: "none" };
  const row = await prisma.calendarEventGuestInterest.findUnique({
    where: { eventId_deviceHash: { eventId, deviceHash } },
    select: { displayName: true, graduationYear: true, wasInVtk: true },
  });
  return row ? { kind: "guest", ...row } : { kind: "none" };
}

/** "32 komen" / "32 going", of `null` onder de drempel. */
export function interestLabel(count: number | null | undefined, locale: Locale): string | null {
  if (!count) return null;
  return locale === "nl" ? `${count} komen` : `${count} going`;
}
