import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { cardDisplayName, resolveStudentCard } from "@/lib/student-card";
import { requireTicketEventCapability } from "./authorization";
import { CARD_HASH_LENGTH, cardHashInput } from "./cardHash";
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

/**
 * Waar een scan vandaan kwam, voor in het scanlogboek.
 *
 * Bewust zonder r-nummer of kaartnummer erin: die worden bij het archiveren van
 * het event gewist, terwijl het logboek blijft staan. Een kopie in de metadata
 * zou dat wissen stilletjes ongedaan maken.
 */
type ScanOrigin = {
  via: "CARD";
  source: "cache" | "kuleuven";
};

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
  const { event, capabilities } = await requireTicketEventCapability(eventId, "SCAN");
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

  const cards = manifestComplete && event.cardCheckIn ? await manifestCardTable(eventId) : null;

  return {
    event: {
      id: event.id,
      title: event.titleNl,
      startsAt: event.startsAt,
      location: event.location,
      cardCheckIn: event.cardCheckIn,
      openScanning: event.openScanning,
    },
    // Of dit toestel de knop "Scanners" mag tonen. Rijdt mee met de bootstrap
    // omdat de scanner anders een tweede aanvraag zou moeten doen om te weten of
    // hij een knop mag tekenen, en dat aan een deur soms zonder netwerk.
    canManageScanners: capabilities.includes("MANAGE_SCANNERS"),
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
      cardSalt: cards?.salt,
      cards: cards?.table,
    },
  };
}

/**
 * De kaarttabel die met het manifest meegaat: gehashte kaart -> ticketcode.
 *
 * Hiermee kan een toestel zonder netwerk een studentenkaart alsnog aan een
 * ticket koppelen, en daarna gewoon de bestaande offline-weg volgen (wachtrij,
 * `clientScanId`, synchroniseren). Enkel kaarten die bij ons al eens gescand
 * zijn staan erin, want alleen die kennen we zonder KU Leuven te bellen; wie zijn
 * kaart nog nooit ergens liet lezen, moet aan de deur zijn QR bovenhalen.
 */
async function manifestCardTable(eventId: string) {
  const attendees = await prisma.ticketOrderItem.findMany({
    where: { eventId, rNumber: { not: null }, ticket: { status: "VALID" } },
    select: { rNumber: true, ticket: { select: { publicCode: true } } },
  });
  const codeByRNumber = new Map<string, string>();
  for (const attendee of attendees) {
    if (attendee.rNumber && attendee.ticket) {
      codeByRNumber.set(attendee.rNumber.trim().toLowerCase(), attendee.ticket.publicCode);
    }
  }
  if (codeByRNumber.size === 0) return { salt: randomBytes(16).toString("hex"), table: {} };

  const knownCards = await prisma.studentCard.findMany({
    where: { rNumber: { in: [...codeByRNumber.keys()] } },
    select: { serial: true, cardAppId: true, rNumber: true },
  });

  const salt = randomBytes(16).toString("hex");
  const table: Record<string, string> = {};
  for (const card of knownCards) {
    const code = codeByRNumber.get(card.rNumber.trim().toLowerCase());
    if (!code) continue;
    const hash = createHash("sha256")
      .update(cardHashInput(salt, `${card.serial};${card.cardAppId}`))
      .digest("hex")
      .slice(0, CARD_HASH_LENGTH);
    table[hash] = code;
  }
  return { salt, table };
}

export async function scanTicket(eventId: string, rawInput: unknown, origin?: ScanOrigin) {
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
        metadata: origin ? { ...origin } : undefined,
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

export const cardScanRequestSchema = scanRequestSchema
  .omit({ credential: true })
  .extend({
    /** Ruw wat de lezer typt: `serial;cardAppId`. */
    card: z.string().trim().min(3).max(400),
  });

/** Waarom een kaart geen ticket opleverde. De scanner vertaalt deze codes. */
export type CardScanReason = "CARD_UNREADABLE" | "NO_TICKET" | "CARD_CHECKIN_DISABLED";

/**
 * Een kaart die niets opleverde, hoort evengoed in het logboek: aan de deur is
 * "die kaart deed niets" precies wat je achteraf wil kunnen terugvinden. Er hangt
 * geen ticket aan, dus dit gaat als INVALID het logboek in met de reden in de
 * metadata; een eigen enumwaarde zou een migratie kosten voor niets.
 *
 * `credentialFingerprint` blijft leeg. Een hash van het kaartnummer zou een
 * stabiele verwijzing naar één persoon zijn die het archiveren overleeft, en dat
 * is net wat het wissen van het r-nummer wil vermijden.
 */
async function logCardScanMiss(
  eventId: string,
  input: z.infer<typeof cardScanRequestSchema>,
  scannerUserId: string,
  reason: CardScanReason,
  detail?: string,
) {
  const gate = input.gateId
    ? await prisma.ticketGate.findFirst({ where: { id: input.gateId, eventId, active: true } })
    : null;
  const log = await prisma.ticketScanLog.create({
    data: {
      eventId,
      scannerUserId,
      gateId: gate?.id ?? null,
      clientScanId: input.clientScanId,
      result: "INVALID",
      clientScannedAt: input.clientScannedAt ? new Date(input.clientScannedAt) : null,
      metadata: { via: "CARD", reason, ...(detail ? { detail } : {}) },
    },
  });
  return { result: "INVALID" as const, scanId: log.id, reason };
}

/**
 * Inchecken met een studentenkaart.
 *
 * De lezer typt `serial;cardAppId` alsof het een toetsenbord is; die string
 * herleiden we via {@link resolveStudentCard} tot een r-nummer, en dat r-nummer
 * staat op hoogstens één bestelregel van dit event (`TicketOrderItem.rNumber`,
 * uniek per event). Vanaf daar loopt alles door dezelfde `scanTicket` als een QR:
 * dezelfde transactie, hetzelfde logboek, dezelfde uitkomsten voor een al
 * gescand, geannuleerd of terugbetaald ticket. Enkel de handtekening ontbreekt,
 * net als bij een handmatig ingetikte code; de kaart zelf is hier het bewijs.
 */
export async function scanTicketCard(eventId: string, rawInput: unknown) {
  const input = cardScanRequestSchema.parse(rawInput);
  const { event, session } = await requireTicketEventCapability(eventId, "SCAN");

  // Eerst kijken of dit `clientScanId` al verwerkt is, nog voor er een
  // kaartverificatie aan te pas komt: een lezer die twee keer stuurt, mag geen
  // tweede call naar KU Leuven en geen tweede check-in veroorzaken.
  const existing = await prisma.ticketScanLog.findUnique({
    where: { clientScanId: input.clientScanId },
    include: { ticket: { include: SCANNED_TICKET_INCLUDE } },
  });
  if (existing) {
    return {
      result: existing.eventId === eventId ? existing.result : ("INVALID" as const),
      ticket: existing.ticket?.eventId === eventId ? ticketDto(existing.ticket) : undefined,
      stats: await eventStats(eventId),
      duplicateRequest: true,
    };
  }

  if (!event.cardCheckIn) {
    return {
      ...(await logCardScanMiss(eventId, input, session.user.id, "CARD_CHECKIN_DISABLED")),
      stats: await eventStats(eventId),
    };
  }

  const resolved = await resolveStudentCard(input.card);
  if (!resolved.ok) {
    return {
      ...(await logCardScanMiss(eventId, input, session.user.id, "CARD_UNREADABLE", resolved.error)),
      stats: await eventStats(eventId),
    };
  }

  const rNumber = resolved.rNumber.trim().toLowerCase();
  const orderItem = await prisma.ticketOrderItem.findFirst({
    where: { eventId, rNumber },
    select: { ticket: { select: { publicCode: true } } },
  });
  if (!orderItem?.ticket) {
    return {
      ...(await logCardScanMiss(eventId, input, session.user.id, "NO_TICKET")),
      // De naam van de kaart, zodat de deurploeg weet wie er staat en die persoon
      // kan opzoeken in de namenlijst. Ze wordt niet bewaard.
      attendeeName: cardDisplayName(resolved) ?? undefined,
      stats: await eventStats(eventId),
    };
  }

  return scanTicket(
    eventId,
    { ...input, credential: orderItem.ticket.publicCode },
    { via: "CARD", source: resolved.source },
  );
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
