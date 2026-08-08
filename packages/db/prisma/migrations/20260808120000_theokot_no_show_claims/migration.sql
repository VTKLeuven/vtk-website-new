-- No-show verwerking krijgt een herneembare sessie-claim en houdt per order bij
-- of de externe gevolgen (mail/ban) afgewerkt zijn.
ALTER TABLE "TheokotSession" ADD COLUMN "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "TheokotOrder" ADD COLUMN "noShowProcessedAt" TIMESTAMP(3);

CREATE INDEX "TheokotOrder_status_noShowProcessedAt_idx"
ON "TheokotOrder"("status", "noShowProcessedAt");

CREATE INDEX "TheokotSession_processedAt_isOpen_pickupEnd_idx"
ON "TheokotSession"("processedAt", "isOpen", "pickupEnd");
