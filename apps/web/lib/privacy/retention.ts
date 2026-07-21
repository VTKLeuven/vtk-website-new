import { prisma } from "@vtk/db";

function positiveDays(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function before(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Enforces short operational retention periods. Financial transaction rows are
 * intentionally not deleted here; their statutory retention is an operator and
 * accounting-policy decision.
 */
export async function runPrivacyRetention(now = new Date()) {
  const accessCutoff = before(positiveDays("PRIVACY_ACCESS_LOG_DAYS", 365), now);
  const rawCutoff = before(positiveDays("PRIVACY_RAW_PAYLOAD_DAYS", 90), now);
  const fingerprintCutoff = before(
    positiveDays("PRIVACY_FINGERPRINT_DAYS", 30),
    now,
  );

  const results = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.doorAccessLog.deleteMany({ where: { at: { lt: accessCutoff } } }),
    prisma.ticketAuditLog.updateMany({
      where: { createdAt: { lt: rawCutoff } },
      data: { ipAddress: null, metadata: { purged: true } },
    }),
    prisma.ticketPaymentWebhook.updateMany({
      where: { receivedAt: { lt: rawCutoff } },
      data: { payload: { purged: true }, lastError: null },
    }),
    prisma.uitleenPaymentWebhook.updateMany({
      where: { receivedAt: { lt: rawCutoff } },
      data: { payload: { purged: true }, lastError: null },
    }),
    prisma.ticketOutboxMessage.updateMany({
      where: {
        createdAt: { lt: rawCutoff },
        status: { in: ["SENT", "FAILED"] },
      },
      data: { recipient: null, payload: { purged: true }, lastError: null },
    }),
    prisma.ticketOrder.updateMany({
      where: {
        createdAt: { lt: fingerprintCutoff },
        requestFingerprint: { not: null },
      },
      data: { requestFingerprint: null },
    }),
  ]);

  return {
    ranAt: now.toISOString(),
    policies: {
      accessLogDays: positiveDays("PRIVACY_ACCESS_LOG_DAYS", 365),
      rawPayloadDays: positiveDays("PRIVACY_RAW_PAYLOAD_DAYS", 90),
      fingerprintDays: positiveDays("PRIVACY_FINGERPRINT_DAYS", 30),
    },
    affected: {
      expiredSessions: results[0].count,
      expiredVerifications: results[1].count,
      doorLogs: results[2].count,
      ticketAuditLogs: results[3].count,
      ticketWebhookPayloads: results[4].count,
      logisticsWebhookPayloads: results[5].count,
      emailOutboxPayloads: results[6].count,
      orderFingerprints: results[7].count,
    },
  };
}
