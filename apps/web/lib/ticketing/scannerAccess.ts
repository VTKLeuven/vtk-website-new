import "server-only";

import { prisma } from "@vtk/db";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireTicketEventCapability } from "./authorization";

/**
 * Scanners toevoegen en weghalen vanuit de scanner zelf.
 *
 * Dit is bewust een smallere weg dan het toegangstabblad in de admin. Daar beheer
 * je alle rollen, hier enkel `SCANNER`, want dit draait op de telefoon van wie
 * aan de deur staat en het antwoordt op één vraag: "Jan komt bijspringen, zet
 * hem erbij." Alles wat verder gaat dan dat hoort achter `MANAGE_ACCESS`.
 *
 * De standaardregel (`hasOpenScanAccess`) dekt al elke praesidiumpost; wat hier
 * bijkomt zijn de mensen daarbuiten, en dat is precies waarom de zoekfunctie op
 * r-nummer werkt en niet enkel op de ledenlijst van een post.
 */

export const scannerUserSchema = z.object({ userId: z.string().min(1).max(64) });
export const scannerGrantSchema = z.object({ grantId: z.string().min(1).max(64) });

/**
 * Zoeken naar iemand om toe te voegen.
 *
 * Gescoped op de capability van dit event en niet op de globale
 * `users.search`-permissie: anders had een lead van de organiserende post daar
 * ook nog een permissie voor nodig, en dan is de knop aan de deur waardeloos.
 * Zelfde afweging als bij formulieren (`api/forms/[formId]/users/search`).
 */
export async function searchScannerCandidates(eventId: string, rawQuery: string) {
  await requireTicketEventCapability(eventId, "MANAGE_SCANNERS");
  const query = rawQuery.trim().slice(0, 200);
  if (query.length < 2) return [];

  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { rNumber: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, email: true, rNumber: true },
  });
}

/**
 * Wie er expliciet als scanner toegevoegd is, plus of de standaardregel aan
 * staat. Dat tweede hoort erbij: zonder die zin voegt iemand aan de deur mensen
 * toe die er allang bij konden.
 */
export async function listEventScanners(eventId: string) {
  const { event } = await requireTicketEventCapability(eventId, "MANAGE_SCANNERS");
  const grants = await prisma.ticketEventUserGrant.findMany({
    where: { eventId, role: "SCANNER" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, rNumber: true } },
    },
  });

  return {
    openScanning: event.openScanning,
    scanners: grants.map((grant) => ({
      grantId: grant.id,
      userId: grant.user.id,
      name: grant.user.name,
      email: grant.user.email,
      rNumber: grant.user.rNumber,
      addedAt: grant.createdAt.toISOString(),
    })),
  };
}

export async function addEventScanner(eventId: string, rawInput: unknown) {
  const { userId } = scannerUserSchema.parse(rawInput);
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_SCANNERS");

  const user = await prisma.user.findFirst({
    where: { id: userId, active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    const existing = await tx.ticketEventUserGrant.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
      select: { role: true },
    });
    // Deze weg mag nooit een bestaande rol overschrijven: dat zou van een smalle
    // capability een manier maken om een OWNER te degraderen. Wie al iets heeft,
    // pas je aan op het toegangstabblad.
    if (existing && existing.role !== "SCANNER") throw new Error("GRANT_ROLE_CONFLICT");
    if (existing) return;

    await tx.ticketEventUserGrant.create({
      data: { eventId, userId: user.id, role: "SCANNER", grantedById: session.user.id },
    });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "ACCESS_GRANTED",
        entityType: "TicketEventUserGrant",
        metadata: { role: "SCANNER", userId: user.id, via: "SCANNER_APP" },
      },
    });
  });

  await logAudit({
    action: "grant",
    entity: "ticketAccess",
    entityId: eventId,
    target: user.name,
    summary: `${user.name} kreeg de rol SCANNER via de scanner`,
  });

  return listEventScanners(eventId);
}

export async function removeEventScanner(eventId: string, rawInput: unknown) {
  const { grantId } = scannerGrantSchema.parse(rawInput);
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_SCANNERS");

  const removed = await prisma.$transaction(async (tx) => {
    // Enkel een SCANNER-grant, om dezelfde reden als hierboven.
    const grant = await tx.ticketEventUserGrant.findFirst({
      where: { id: grantId, eventId, role: "SCANNER" },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!grant) throw new Error("GRANT_NOT_FOUND");

    await tx.ticketEventUserGrant.delete({ where: { id: grant.id } });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "ACCESS_REVOKED",
        entityType: "TicketEventUserGrant",
        entityId: grant.id,
        metadata: { role: "SCANNER", via: "SCANNER_APP" },
      },
    });
    return grant.user.name;
  });

  await logAudit({
    action: "revoke",
    entity: "ticketAccess",
    entityId: eventId,
    target: removed,
    summary: `${removed} is geen scanner meer`,
  });

  return listEventScanners(eventId);
}
