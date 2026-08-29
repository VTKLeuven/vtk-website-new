import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";

function positiveDays(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function before(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Inzendingen van formulieren met een eigen bewaartermijn.
 *
 * De termijn staat per formulier (`retentionDays`) en is standaard leeg: dan
 * wordt er niets opgeruimd. Dat is bewust; stil verdwijnende inzendingen zijn
 * erger dan een volle tabel, en wie ze wil laten verlopen, zet het zelf aan.
 *
 * De bestanden gaan eerst weg en de rijen daarna: een wees in de objectopslag
 * is minder erg dan een rij die naar een bestand wijst dat er niet meer is.
 */
async function purgeExpiredFormEntries(now: Date): Promise<number> {
  const forms = await prisma.form.findMany({
    where: { retentionDays: { not: null } },
    select: { id: true, retentionDays: true },
  });

  let removed = 0;
  for (const form of forms) {
    const cutoff = before(form.retentionDays as number, now);
    const expired = await prisma.formEntry.findMany({
      where: {
        formId: form.id,
        OR: [{ submittedAt: { lt: cutoff } }, { submittedAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true, uploads: { select: { storageKey: true } } },
      take: 500,
    });
    if (expired.length === 0) continue;

    for (const entry of expired) {
      for (const upload of entry.uploads) {
        await deleteObject(upload.storageKey).catch((error) => {
          console.error("[privacy] formulierbestand verwijderen mislukt", error);
        });
      }
    }
    const deleted = await prisma.formEntry.deleteMany({
      where: { id: { in: expired.map((entry) => entry.id) } },
    });
    removed += deleted.count;
  }
  return removed;
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
  const takedownCutoff = before(positiveDays("PRIVACY_TAKEDOWN_DAYS", 365), now);

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
    prisma.formAuditLog.updateMany({
      where: { createdAt: { lt: rawCutoff } },
      data: { ipAddress: null, metadata: { purged: true } },
    }),
    prisma.formOutboxMessage.updateMany({
      where: {
        createdAt: { lt: rawCutoff },
        status: { in: ["SENT", "FAILED"] },
      },
      data: { recipient: null, payload: { purged: true }, lastError: null },
    }),
    prisma.formEntry.updateMany({
      where: {
        createdAt: { lt: fingerprintCutoff },
        requestFingerprint: { not: null },
      },
      data: { requestFingerprint: null },
    }),
    prisma.ticketOrder.updateMany({
      where: {
        createdAt: { lt: fingerprintCutoff },
        requestFingerprint: { not: null },
      },
      data: { requestFingerprint: null },
    }),
    // Verwijderverzoeken worden geanonimiseerd, niet verwijderd: dat een foto
    // op verzoek weggehaald is, moet navolgbaar blijven, maar wie het vroeg
    // hoeft daarvoor niet jaren bewaard te blijven. Enkel afgehandelde
    // verzoeken; een openstaand verzoek zonder afzender is onbehandelbaar.
    prisma.photoTakedownRequest.updateMany({
      where: {
        handledAt: { lt: takedownCutoff },
        status: { in: ["DELETED", "KEPT"] },
        reporterEmail: { not: "" },
      },
      data: { reporterName: "", reporterEmail: "", message: null },
    }),
  ]);

  const formEntries = await purgeExpiredFormEntries(now);

  return {
    ranAt: now.toISOString(),
    policies: {
      accessLogDays: positiveDays("PRIVACY_ACCESS_LOG_DAYS", 365),
      rawPayloadDays: positiveDays("PRIVACY_RAW_PAYLOAD_DAYS", 90),
      fingerprintDays: positiveDays("PRIVACY_FINGERPRINT_DAYS", 30),
      takedownDays: positiveDays("PRIVACY_TAKEDOWN_DAYS", 365),
    },
    affected: {
      formEntries,
      expiredSessions: results[0].count,
      expiredVerifications: results[1].count,
      doorLogs: results[2].count,
      ticketAuditLogs: results[3].count,
      ticketWebhookPayloads: results[4].count,
      logisticsWebhookPayloads: results[5].count,
      emailOutboxPayloads: results[6].count,
      formAuditLogs: results[7].count,
      formOutboxPayloads: results[8].count,
      formEntryFingerprints: results[9].count,
      orderFingerprints: results[10].count,
      takedownRequests: results[11].count,
    },
  };
}
