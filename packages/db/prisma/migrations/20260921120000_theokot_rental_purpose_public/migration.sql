-- De publieke verhuurkalender toont standaard enkel dat de zaal bezet is, niet
-- waarvoor. Wie de verhuur doet kan de aard van de activiteit per aanvraag
-- vrijgeven; daarom staat dit op de aanvraag en niet in de instellingen, want
-- "[Theokot] Kaas- en wijnavond" mag publiek en "Verjaardag van Marie" niet.
ALTER TABLE "TheokotRental" ADD COLUMN "purposePublic" BOOLEAN NOT NULL DEFAULT false;
