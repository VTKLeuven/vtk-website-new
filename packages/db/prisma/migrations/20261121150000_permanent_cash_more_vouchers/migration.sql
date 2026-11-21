-- Guidobonnen (€ 1) en bonnen voor een gratis broodje (€ 2,60) in de vaste
-- kassa's. Bestaande regels krijgen 0 stuks: die soorten bestonden toen niet in
-- het kasboek, dus 0 is daar de juiste waarde. De waarde per bon blijft er 0;
-- met 0 stuks doet ze niet mee.
ALTER TABLE "PermanentCashEntry" ADD COLUMN "guidoVouchers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PermanentCashEntry" ADD COLUMN "sandwichVouchers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PermanentCashEntry" ADD COLUMN "guidoVoucherValueCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PermanentCashEntry" ADD COLUMN "sandwichVoucherValueCents" INTEGER NOT NULL DEFAULT 0;
