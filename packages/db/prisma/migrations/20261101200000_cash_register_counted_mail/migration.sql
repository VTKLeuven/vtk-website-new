-- Wanneer Beheer mailde dat de kassa geteld is. Bestaande kassa's krijgen NULL:
-- die mail bestond nog niet, dus er vertrok er ook geen.
ALTER TABLE "CashRegister" ADD COLUMN "countedMailSentAt" TIMESTAMPTZ(3);
