import 'server-only';
import { prisma } from '@vtk/db';
import type { Prisma, UitleenAuditKind } from '@prisma/client';

/**
 * Historiek van een aanvraag of een rit wegschrijven.
 *
 * Schrijf dit in dezelfde transactie als de wijziging zelf (geef dan de `tx`
 * mee), zodat er nooit een regel in de historiek staat voor iets dat uiteindelijk
 * niet gebeurd is, en omgekeerd.
 *
 * De velden op de aanvraag (`decidedAt`, `pickedUpAt`, ...) bewaren enkel de
 * laatste toestand; sinds het team beslissingen kan terugdraaien, is dat te
 * weinig om te zien wat er gebeurd is.
 */
export type AuditTarget = { reservationId: string } | { transportBookingId: string };

export type AuditEntry = {
  kind: UitleenAuditKind;
  fromStatus?: string | null;
  toStatus?: string | null;
  /** Wat er precies gebeurde, in mensentaal: "chauffeur: Jos", "reden: kar defect". */
  note?: string | null;
  actorId: string;
};

/** `PrismaClient` of een transactie-client; beide kunnen deze tabel schrijven. */
type Writer = Prisma.TransactionClient | typeof prisma;

export async function writeAudit(
  writer: Writer,
  target: AuditTarget,
  entry: AuditEntry
): Promise<void> {
  await writer.uitleenAuditLog.create({
    data: {
      reservationId: 'reservationId' in target ? target.reservationId : null,
      transportBookingId: 'transportBookingId' in target ? target.transportBookingId : null,
      kind: entry.kind,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      note: entry.note?.trim() || null,
      actorId: entry.actorId,
    },
  });
}
