-- Herinnering voor een shift: standaard een dag vooraf en twee uur vooraf, per
-- lid uitzetbaar. Bewust geen `MailCategory`: die array is opt-in nieuwsbrieven,
-- en dit is transactioneel (je hebt je zelf ingeschreven).
ALTER TABLE "User"
  ADD COLUMN "shiftReminderDayBefore" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "shiftReminderSoon"      BOOLEAN NOT NULL DEFAULT true;

-- Per deelnemer: het moment waarop de herinnering afgehandeld is. NULL betekent
-- "staat nog te wachten". De primaire sleutel is (shiftId, userId), dus er kan
-- per persoon per shift maar één van elk bestaan; dat is meteen de garantie
-- tegen dubbel versturen.
ALTER TABLE "ShiftParticipant"
  ADD COLUMN "reminderDayBeforeAt" TIMESTAMP(3),
  ADD COLUMN "reminderSoonAt"      TIMESTAMP(3);

-- Bestaande inschrijvingen voor shiften die al binnen het venster vallen (of al
-- voorbij zijn) meteen als afgehandeld markeren. Anders krijgt iedereen die nu
-- al ingeschreven staat bij de eerste run een herinnering voor iets dat vandaag
-- al bezig is.
UPDATE "ShiftParticipant" p
SET "reminderDayBeforeAt" = NOW()
FROM "Shift" s
WHERE s."id" = p."shiftId"
  AND s."startTime" < NOW() + INTERVAL '24 hours';

UPDATE "ShiftParticipant" p
SET "reminderSoonAt" = NOW()
FROM "Shift" s
WHERE s."id" = p."shiftId"
  AND s."startTime" < NOW() + INTERVAL '2 hours';
