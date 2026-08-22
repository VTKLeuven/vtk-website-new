import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { requireTicketEventCapability } from "./authorization";
import { ticketColorKey } from "./ticketColors";
import {
  credentialFingerprint,
  extractTicketCredential,
  secureTokenHash,
  verifyTicketCredential,
} from "./crypto";

export const scanRequestSchema = z.object({
  credential: z.string().trim().min(6).max(2_000),
  clientScanId: z.string().trim().min(8).max(160),
  gateId: z.string().trim().min(1).nullable().optional(),
  deviceId: z.string().trim().min(8).max(160),
  clientScannedAt: z.string().datetime().nullable().optional(),
});

type ScannableTicket = Prisma.TicketGetPayload<{ include: typeof SCANNED_TICKET_INCLUDE }>;

/**
 * Wat een scan van een ticket nodig heeft. De kleur komt van het tickettype zelf
 * en niet uit een kopie op de bestelregel, anders dan `ticketTypeName`: die kopie
 * bestaat om de geschiedenis vast te houden wanneer een type hernoemd wordt,
 * terwijl je een kleur net wél wil kunnen bijsturen tot vlak voor de deur
 * opengaat. De relatie is `Restrict`, dus ze staat er altijd.
 */
const SCANNED_TICKET_INCLUDE = {
  orderItem: { include: { ticketType: { select: { color: true } } } },
} satisfies Prisma.TicketInclude;

function ticketDto(ticket: ScannableTicket | null) {
  return ticket
    ? {
        publicId: ticket.publicCode as string,
        attendeeName: ticket.orderItem.attendeeName as string,
        typeName: ticket.orderItem.ticketTypeName as string,
        typeColor: ticketColorKey(ticket.orderItem.ticketType.color),
        checkedInAt: ticket.checkedInAt as Date | null,
      }
    : undefined;
}

async function eventStats(eventId: string) {
  const [total, checkedIn] = await Promise.all([
    prisma.ticket.count({ where: { eventId, status: "VALID" } }),
    prisma.ticket.count({ where: { eventId, status: "VALID", checkedInAt: { not: null } } }),
  ]);
  return { total, checkedIn };
}

/**
 * Bovengrens op het offline-manifest. Een jobbeurs of galabal zit rond de 1000 à
 * 1500 tickets; met deze grens blijft de download onder een paar honderd kilobyte
 * en blijft ze in het geheugen van een telefoon hanteerbaar. Zit een event
 * erboven, dan krijgt het toestel geen manifest en blijft het gewoon online
 * scannen (`manifestComplete: false`), in plaats van met een halve lijst te
 * werken en geldige tickets te weigeren.
 */
const MANIFEST_LIMIT = 5_000;

export async function scannerBootstrap(eventId: string) {
  const { event } = await requireTicketEventCapability(eventId, "SCAN");
  const [gates, stats, ticketCount] = await Promise.all([
    prisma.ticketGate.findMany({
      where: { eventId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    eventStats(eventId),
    prisma.ticket.count({ where: { eventId, status: "VALID" } }),
  ]);

  // De lijst geldige tickets, zodat een toestel zonder netwerk zelf kan zeggen of
  // een QR bij dit event hoort. De handtekening kán hier niet gecontroleerd
  // worden: daarvoor is het servergeheim nodig, en dat op een telefoon zetten
  // betekent dat wie die telefoon uitleest zelf tickets kan maken. Offline
  // controleren we dus op lidmaatschap van deze lijst plus het versienummer; de
  // handtekening wordt alsnog geverifieerd wanneer de scan gesynchroniseerd
  // wordt.
  const manifestComplete = ticketCount <= MANIFEST_LIMIT;
  const tickets = manifestComplete
    ? await prisma.ticket.findMany({
        where: { eventId, status: "VALID" },
        select: {
          publicCode: true,
          credentialVersion: true,
          checkedInAt: true,
          orderItem: {
            select: {
              attendeeName: true,
              ticketTypeName: true,
              ticketType: { select: { color: true } },
            },
          },
        },
      })
    : [];

  return {
    event: {
      id: event.id,
      title: event.titleNl,
      startsAt: event.startsAt,
      location: event.location,
    },
    gates,
    stats,
    manifest: {
      complete: manifestComplete,
      generatedAt: new Date().toISOString(),
      ticketCount,
      tickets: tickets.map((ticket) => ({
        code: ticket.publicCode,
        version: ticket.credentialVersion,
        checkedIn: ticket.checkedInAt !== null,
        name: ticket.orderItem.attendeeName,
        type: ticket.orderItem.ticketTypeName,
        typeColor: ticketColorKey(ticket.orderItem.ticketType.color),
      })),
    },
  };
}

export async function scanTicket(eventId: string, rawInput: unknown) {
  const input = scanRequestSchema.parse(rawInput);
  const { session } = await requireTicketEventCapability(eventId, "SCAN");
  const existing = await prisma.ticketScanLog.findUnique({
    where: { clientScanId: input.clientScanId },
    include: { ticket: { include: SCANNED_TICKET_INCLUDE } },
  });
  if (existing) {
    if (existing.eventId !== eventId) {
      return {
        result: "INVALID" as const,
        stats: await eventStats(eventId),
        duplicateRequest: true,
      };
    }
    return {
      result: existing.result,
      ticket: existing.ticket?.eventId === eventId ? ticketDto(existing.ticket) : undefined,
      stats: await eventStats(eventId),
      duplicateRequest: true,
    };
  }

  const gate = input.gateId
    ? await prisma.ticketGate.findFirst({ where: { id: input.gateId, eventId, active: true } })
    : null;
  if (input.gateId && !gate) throw new Error("GATE_NOT_FOUND");

  let deviceId: string | null = null;
  if (input.deviceId) {
    const existingDevice = await prisma.ticketScanDevice.findUnique({ where: { id: input.deviceId } });
    if (existingDevice && (existingDevice.eventId !== eventId || existingDevice.revokedAt)) {
      throw new Error("DEVICE_REVOKED");
    }
    const device = existingDevice
      ? await prisma.ticketScanDevice.update({
          where: { id: existingDevice.id },
          data: { lastSeenAt: new Date() },
        })
      : await prisma.ticketScanDevice.create({
          data: {
            id: input.deviceId,
            eventId,
            label: `Scanner ${session.user.name}`,
            tokenHash: secureTokenHash(`scanner-device:${eventId}:${input.deviceId}`),
            createdById: session.user.id,
            lastSeenAt: new Date(),
          },
        });
    deviceId = device.id;
  }

  const extracted = extractTicketCredential(input.credential);
  const verified = verifyTicketCredential(extracted);
  const manualCode = !verified && /^[A-Za-z0-9_-]{12,64}$/.test(extracted) ? extracted : null;
  const publicCode = verified?.publicId ?? manualCode;
  const now = new Date();
  let outcome: { result: "ACCEPTED" | "ALREADY_USED" | "WRONG_EVENT" | "INVALID" | "VOID" | "REFUNDED"; scanId: string; ticketId: string | null };
  try {
    outcome = await prisma.$transaction(async (tx) => {
    const ticket = publicCode
      ? await tx.ticket.findUnique({ where: { publicCode }, include: SCANNED_TICKET_INCLUDE })
      : null;
    const sameEventTicket = ticket?.eventId === eventId ? ticket : null;
    const refundPending = sameEventTicket
      ? await tx.ticketRefundItem.count({
          where: { orderItemId: sameEventTicket.orderItemId, refund: { status: "PENDING" } },
        })
      : 0;
    let result: "ACCEPTED" | "ALREADY_USED" | "WRONG_EVENT" | "INVALID" | "VOID" | "REFUNDED";

    if (!ticket) {
      result = "INVALID";
    } else if (!sameEventTicket) {
      result = "WRONG_EVENT";
    } else if (
      verified &&
      (verified.version !== sameEventTicket.credentialVersion ||
        secureTokenHash(extracted) !== sameEventTicket.credentialHash)
    ) {
      result = "INVALID";
    } else if (sameEventTicket.status === "REFUNDED") {
      result = "REFUNDED";
    } else if (refundPending > 0 || sameEventTicket.status !== "VALID") {
      result = "VOID";
    } else {
      const changed = await tx.$executeRaw`
        UPDATE "Ticket"
        SET "checkedInAt" = ${now}, "checkedInById" = ${session.user.id}
        WHERE "id" = ${sameEventTicket.id}
          AND "eventId" = ${eventId}
          AND "status" = 'VALID'::"TicketStatus"
          AND "checkedInAt" IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "TicketRefundItem" refund_item
            JOIN "TicketRefund" refund ON refund."id" = refund_item."refundId"
            WHERE refund_item."orderItemId" = ${sameEventTicket.orderItemId}
              AND refund."status" = 'PENDING'::"TicketRefundStatus"
          )
      `;
      if (changed === 1) {
        result = "ACCEPTED";
      } else {
        const current = await tx.ticket.findUnique({ where: { id: sameEventTicket.id } });
        result = current?.status === "REFUNDED"
          ? "REFUNDED"
          : current?.status !== "VALID"
            ? "VOID"
            : "ALREADY_USED";
      }
    }

    const log = await tx.ticketScanLog.create({
      data: {
        eventId,
        ticketId: sameEventTicket?.id ?? null,
        scannerUserId: session.user.id,
        deviceId,
        gateId: gate?.id ?? null,
        clientScanId: input.clientScanId,
        result,
        credentialFingerprint: credentialFingerprint(extracted),
        scannedAt: now,
        clientScannedAt: input.clientScannedAt ? new Date(input.clientScannedAt) : null,
      },
    });
      return { result, scanId: log.id, ticketId: sameEventTicket?.id ?? null };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.ticketScanLog.findUnique({
        where: { clientScanId: input.clientScanId },
        include: { ticket: { include: SCANNED_TICKET_INCLUDE } },
      });
      if (duplicate?.eventId === eventId) {
        return {
          result: duplicate.result,
          ticket: duplicate.ticket?.eventId === eventId ? ticketDto(duplicate.ticket) : undefined,
          stats: await eventStats(eventId),
          duplicateRequest: true,
        };
      }
    }
    throw error;
  }
  const freshTicket = outcome.ticketId
    ? await prisma.ticket.findUnique({ where: { id: outcome.ticketId }, include: SCANNED_TICKET_INCLUDE })
    : null;
  return {
    result: outcome.result,
    scanId: outcome.scanId,
    ticket: ticketDto(freshTicket),
    stats: await eventStats(eventId),
  };
}

/** Hoeveel gequeuede scans één synchronisatie mag meesturen. */
export const SCAN_BATCH_LIMIT = 100;

export const scanBatchSchema = z.object({
  scans: z.array(scanRequestSchema).min(1).max(SCAN_BATCH_LIMIT),
});

/**
 * Verwerkt een wachtrij offline gemaakte scans.
 *
 * Bewust één voor één door hetzelfde `scanTicket` als een gewone scan: die doet
 * de check-in in een transactie en dedupliceert op `clientScanId`, dus een
 * synchronisatie die halverwege afbreekt kan gewoon opnieuw. De volgorde blijft
 * die van de wachtrij, zodat bij twee scans van hetzelfde ticket de eerste
 * binnenkomt en de tweede als ALREADY_USED terugkomt; dat is precies het
 * conflict dat de scanner achteraf moet tonen.
 */
export async function scanTicketBatch(eventId: string, rawInput: unknown) {
  const { scans } = scanBatchSchema.parse(rawInput);
  const results: Array<{
    clientScanId: string;
    result: string;
    ticket?: ReturnType<typeof ticketDto>;
    error?: string;
  }> = [];

  for (const scan of scans) {
    try {
      const outcome = await scanTicket(eventId, scan);
      results.push({
        clientScanId: scan.clientScanId,
        result: outcome.result,
        ticket: outcome.ticket,
      });
    } catch (error) {
      // Eén kapotte scan mag de rest van de wachtrij niet blokkeren; het toestel
      // houdt hem bij en probeert later opnieuw.
      results.push({
        clientScanId: scan.clientScanId,
        result: "ERROR",
        error: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  }

  return { results, stats: await eventStats(eventId) };
}

export async function reverseTicketScan(
  eventId: string,
  input: { scanId: string; clientScanId: string }
) {
  const { session } = await requireTicketEventCapability(eventId, "SCAN");
  const existing = await prisma.ticketScanLog.findUnique({
    where: { clientScanId: input.clientScanId },
    include: { ticket: { include: SCANNED_TICKET_INCLUDE } },
  });
  if (existing) {
    if (
      existing.eventId === eventId &&
      existing.result === "REVERSED" &&
      existing.reversesScanId === input.scanId &&
      existing.ticket
    ) {
      return {
        result: "REVERSED" as const,
        ticket: ticketDto(existing.ticket),
        stats: await eventStats(eventId),
        duplicateRequest: true,
      };
    }
    throw new Error("CLIENT_SCAN_ID_CONFLICT");
  }
  const ticket = await prisma.$transaction(async (tx) => {
    const scan = await tx.ticketScanLog.findFirst({
      where: { id: input.scanId, eventId, result: "ACCEPTED" },
      include: { ticket: { include: SCANNED_TICKET_INCLUDE }, reversedBy: true },
    });
    if (!scan?.ticket || scan.reversedBy) throw new Error("SCAN_NOT_REVERSIBLE");

    const changed = await tx.$executeRaw`
      UPDATE "Ticket"
      SET "checkedInAt" = NULL, "checkedInById" = NULL
      WHERE "id" = ${scan.ticket.id}
        AND "eventId" = ${eventId}
        AND "checkedInAt" = ${scan.scannedAt}
    `;
    if (changed !== 1) throw new Error("SCAN_NO_LONGER_CURRENT");
    await tx.ticketScanLog.create({
      data: {
        eventId,
        ticketId: scan.ticket.id,
        scannerUserId: session.user.id,
        gateId: scan.gateId,
        deviceId: scan.deviceId,
        clientScanId: input.clientScanId,
        result: "REVERSED",
        reversesScanId: scan.id,
        credentialFingerprint: scan.credentialFingerprint,
      },
    });
    return scan.ticket;
  });
  return { result: "REVERSED" as const, ticket: ticketDto(ticket), stats: await eventStats(eventId) };
}

export async function ticketEventStats(eventId: string) {
  const access = await requireTicketEventCapability(eventId, "VIEW_REPORTS");
  const [stats, pools, types, recent] = await Promise.all([
    eventStats(eventId),
    prisma.ticketInventoryPool.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } }),
    prisma.ticketType.findMany({
      where: { eventId },
      include: { _count: { select: { orderItems: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ticketScanLog.findMany({
      where: { eventId, result: "ACCEPTED" },
      select: { id: true, scannedAt: true, gate: { select: { name: true } } },
      orderBy: { scannedAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    event: { id: access.event.id, title: access.event.titleNl },
    stats,
    pools: pools.map((pool) => ({
      id: pool.id,
      name: pool.nameNl,
      capacity: pool.capacity,
      reserved: pool.reservedCount,
      sold: pool.soldCount,
    })),
    types: types.map((type) => ({ id: type.id, name: type.nameNl, orders: type._count.orderItems })),
    recent,
  };
}
