-- Kassa's: begin- en einduur van de activiteit, zodat een Bancontact-bakje of
-- Payconiq-rekening niet aan twee activiteiten tegelijk uitgeleend wordt.
--
-- Kassa's die er al zijn, krijgen NULL: bij het aanvragen werd er niet naar
-- gevraagd, en de uren zijn achteraf niet te kennen. Het scherm toont dan
-- geen uur, en de controle op bezette toestellen rekent zo'n kassa als de hele
-- dag (`registerInterval` in lib/kassas/kassa.ts). Geen backfill dus.

-- AlterTable
ALTER TABLE "CashRegister" ADD COLUMN     "endsAt" TIMESTAMPTZ(3),
ADD COLUMN     "startsAt" TIMESTAMPTZ(3);
