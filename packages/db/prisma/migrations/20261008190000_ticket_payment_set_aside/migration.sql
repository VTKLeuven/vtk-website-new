-- Een geslaagde betaling zonder ticket ertegenover krijgt een eigen kolom in
-- plaats van een waarde in "providerStatus". Dat veld zegt wat de provider
-- meldde; een markering van het beheer hoort er niet in, want wie het
-- overschrijft, laat zo'n betaling weer tickets opleveren.
CREATE TYPE "TicketPaymentSetAside" AS ENUM ('NEEDS_REFUND', 'REFUNDED_MANUALLY');

ALTER TABLE "TicketPayment" ADD COLUMN "setAside" "TicketPaymentSetAside";

-- Bestaande betalingen: elke gewone betaling krijgt NULL, en dat klopt. Een
-- betaling die al met de oude markering apart stond, neemt die mee, en haar
-- "providerStatus" wordt weer wat de provider meldde: geslaagd.
UPDATE "TicketPayment" SET "setAside" = 'NEEDS_REFUND', "providerStatus" = 'paid'
WHERE "status" = 'SUCCEEDED' AND "providerStatus" = 'needs_refund';
UPDATE "TicketPayment" SET "setAside" = 'REFUNDED_MANUALLY', "providerStatus" = 'paid'
WHERE "status" = 'SUCCEEDED' AND "providerStatus" = 'refunded_manually';

-- De melding in het beheer telt per event de betalingen die nog terug moeten.
CREATE INDEX "TicketPayment_setAside_idx" ON "TicketPayment"("setAside");
