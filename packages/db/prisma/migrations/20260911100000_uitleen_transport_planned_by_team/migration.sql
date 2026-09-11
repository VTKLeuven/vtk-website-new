-- Enkel een rit die Logistiek zelf intekende, mag verwijderd worden; een rit uit
-- een aanvraag blijft afwijzen of annuleren. Zie de comment bij het veld in
-- schema.prisma en docs/design-decisions.md.
ALTER TABLE "UitleenTransportBooking" ADD COLUMN "plannedByTeam" BOOLEAN NOT NULL DEFAULT false;

-- Bestaande ritten: een rit die het team inplande, kreeg bij het aanmaken een
-- auditregel met precies deze note, geschreven vanuit één plek in de code
-- (`adminCreateTransportAction`). Zonder deze backfill is elke rit van voor deze
-- migratie onverwijderbaar, ook die het team zelf tekende.
UPDATE "UitleenTransportBooking"
   SET "plannedByTeam" = true
 WHERE "id" IN (
   SELECT "transportBookingId"
     FROM "UitleenAuditLog"
    WHERE "note" = 'ingepland door Logistiek'
      AND "transportBookingId" IS NOT NULL
 );
