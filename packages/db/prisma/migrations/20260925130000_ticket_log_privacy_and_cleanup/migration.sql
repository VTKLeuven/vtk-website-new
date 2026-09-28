-- TicketScanLog en TicketAuditLog blijven append-only, maar de trigger was
-- strenger dan wat de site zelf doet. Ze liet enkel een verwijzing naar een
-- gewiste gebruiker op NULL zetten (`ON DELETE SET NULL`), terwijl er sindsdien
-- drie echte paden bijgekomen zijn die ze alle drie weigerde:
--
--   1. Een account wissen (`lib/privacy/account.ts`) schrijft naast
--      `actorUserId` ook `ipAddress` en `metadata` leeg. Dat viel buiten de
--      toegelaten kolom, dus elk account met één ticketlogregel bleef staan met
--      "TicketAuditLog is append-only". Een wisverzoek dat niet uitgevoerd raakt
--      is precies wat hier niet mag.
--   2. De bewaartermijnen (`lib/privacy/retention.ts`) schrijven na 90 dagen
--      hetzelfde tweetal leeg. Die opkuis draaide dus nooit.
--   3. Een ticketevent verwijderen (`deleteTicketEventAction`) gooit het
--      logboek en de scanlijnen van dat event weg. Dat kan enkel wanneer er nog
--      geen énkele bestelling op staat; die grens staat in de actie zelf en
--      staat nu ook hier.
--
-- Wat een logregel zegt (welke actie, op welk event, wanneer) blijft
-- onveranderlijk. Wat weg mag, is wie het was en wat er aan ruwe context aan
-- hangt, en enkel in één richting: naar leeg.

CREATE OR REPLACE FUNCTION "ticket_scan_log_prevent_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "TicketOrder" o WHERE o."eventId" = OLD."eventId"
        ) THEN
            RETURN OLD;
        END IF;

        RAISE EXCEPTION 'TicketScanLog is append-only';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['scannerUserId', 'deviceId', 'gateId'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['scannerUserId', 'deviceId', 'gateId'])
       AND (NEW."scannerUserId" IS NOT DISTINCT FROM OLD."scannerUserId" OR NEW."scannerUserId" IS NULL)
       AND (NEW."deviceId" IS NOT DISTINCT FROM OLD."deviceId" OR NEW."deviceId" IS NULL)
       AND (NEW."gateId" IS NOT DISTINCT FROM OLD."gateId" OR NEW."gateId" IS NULL) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'TicketScanLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "ticket_audit_log_prevent_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "TicketOrder" o WHERE o."eventId" = OLD."eventId"
        ) THEN
            RETURN OLD;
        END IF;

        RAISE EXCEPTION 'TicketAuditLog is append-only';
    END IF;

    -- `metadata` mag enkel de wismarkering worden, niet zomaar een andere
    -- inhoud: anders is het logboek alsnog herschrijfbaar, met één omweg.
    IF (to_jsonb(NEW) - ARRAY['actorUserId', 'ipAddress', 'metadata'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['actorUserId', 'ipAddress', 'metadata'])
       AND (NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId" OR NEW."actorUserId" IS NULL)
       AND (NEW."ipAddress" IS NOT DISTINCT FROM OLD."ipAddress" OR NEW."ipAddress" IS NULL)
       AND (
           NEW."metadata" IS NOT DISTINCT FROM OLD."metadata"
           OR NEW."metadata" = '{"purged": true}'::jsonb
       ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'TicketAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
