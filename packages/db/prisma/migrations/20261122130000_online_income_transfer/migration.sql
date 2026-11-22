-- Overschrijvingen: geld dat iemand rechtstreeks op een rekening van de kring
-- stortte, met de hand ingevoerd op /admin/inkomsten/overschrijvingen. Een
-- nieuwe bron naast de vier exports.
--
-- Bestaande rijen: niets verandert. Er is nog geen enkele overschrijving; de
-- eerste maakt haar kanaal (één per rekening) en haar import zelf aan.
--
-- De nieuwe waarde wordt in deze migratie niet gebruikt, zodat de beperking van
-- Postgres op een nieuwe enumwaarde in dezelfde transactie niet hindert.

-- AlterEnum
ALTER TYPE "IncomeSource" ADD VALUE 'TRANSFER';
