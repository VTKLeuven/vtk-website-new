-- Bancontact betaalt niet terug via de API; de penning stort het bedrag met de
-- hand terug en heeft daarvoor de rekening van de koper nodig.
--
-- Bestaande betalingen: NULL. Voor Mollie is dat juist (die betaalt zelf
-- terug). Voor een oude Bancontact-betaling is de rekening niet geweten; het
-- beheer haalt ze op wanneer iemand ze nodig heeft ("Rekeningnummer ophalen").
ALTER TABLE "TicketPayment" ADD COLUMN "refundIban" TEXT;
ALTER TABLE "TicketPayment" ADD COLUMN "refundAccountName" TEXT;
