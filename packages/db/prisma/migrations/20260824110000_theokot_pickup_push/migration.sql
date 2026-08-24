-- Markering voor het pushbericht "je broodje ligt klaar".
-- Zelfde claim-dan-versturen-aanpak als bij de shift-herinneringen: de markering
-- gaat om in een voorwaardelijke update, en enkel wie die wint verstuurt.

ALTER TABLE "TheokotOrder" ADD COLUMN "pickupPushedAt" TIMESTAMPTZ(3);

CREATE INDEX "TheokotOrder_status_pickupPushedAt_idx" ON "TheokotOrder"("status", "pickupPushedAt");
