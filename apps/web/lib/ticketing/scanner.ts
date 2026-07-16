import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { requireTicketEventCapability } from "./authorization";
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

type ScannableTicket = Prisma.TicketGetPayload<{ include: { orderItem: true } }>;

function ticketDto(ticket: ScannableTicket | null) {
  return ticket
    ? {
        publicId: ticket.publicCode as string,
        attendeeName: ticket.orderItem.attendeeName as string,
        typeName: ticket.orderItem.ticketTypeName as string,
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

export async function scannerBootstrap(eventId: string) {
  const { event } = await requireTicketEventCapability(eventId, "SCAN");
  const [gates, stats] = await Promise.all([
    prisma.ticketGate.findMany({
      where: { eventId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    eventStats(eventId),
  ]);
  return {
    event: {
      id: event.id,
      title: event.titleNl,
      startsAt: event.startsAt,
      location: event.location,
    },
    gates,
    stats,
  };
}

export async function scanTicket(eventId: string, rawInput: unknown) {
  const input = scanRequestSchema.parse(rawInput);
  const { session } = await requireTicketEventCapability(eventId, "SCAN");
  const existing = await prisma.ticketScanLog.findUnique({
    where: { clientScanId: input.clientScanId },
    include: { ticket: { include: { orderItem: true } } },
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
      ? await tx.ticket.findUnique({ where: { publicCode }, include: { orderItem: true } })
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
        include: { ticket: { include: { orderItem: true } } },
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
    ? await prisma.ticket.findUnique({ where: { id: outcome.ticketId }, include: { orderItem: true } })
    : null;
  return {
    result: outcome.result,
    scanId: outcome.scanId,
    ticket: ticketDto(freshTicket),
    stats: await eventStats(eventId),
  };
}

export async function reverseTicketScan(
  eventId: string,
  input: { scanId: string; clientScanId: string }
) {
  const { session } = await requireTicketEventCapability(eventId, "SCAN");
  const existing = await prisma.ticketScanLog.findUnique({
    where: { clientScanId: input.clientScanId },
    include: { ticket: { include: { orderItem: true } } },
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
      include: { ticket: { include: { orderItem: true } }, reversedBy: true },
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
