-- Per voertuig instellen of leden het zelf mogen aanvragen (F6.21).
--
-- Bestaande voertuigen krijgen `true` en dat is hier de juiste waarde: tot nu
-- konden leden elk actief voertuig aanvragen, en dat verandert niet door deze
-- migratie. Het team zet er achteraf een uit (bv. een gehuurd busje) op
-- /beheer/instellingen. Geen backfill nodig; het raakt geen enkele rit.
ALTER TABLE "UitleenVehicle" ADD COLUMN "requestableByMembers" BOOLEAN NOT NULL DEFAULT true;
