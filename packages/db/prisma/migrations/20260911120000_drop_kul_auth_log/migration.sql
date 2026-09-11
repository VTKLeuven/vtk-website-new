-- KU Leuven SSO-debuglog verwijderd.
-- Volgens de gebruiksvoorwaarden van de KU Leuven SSO mogen we de claims die we
-- bij een login ontvangen niet bijhouden. De opt-in log (Admin -> IT -> KU Leuven
-- SSO) diende enkel om de FirW-parsing te testen. De tabel gaat weg, en daarmee
-- elke rij die er nog in stond.

-- DropTable
DROP TABLE "KulAuthLog";

-- De bijhorende toggle; zonder code die hem leest is het een dode instelling.
DELETE FROM "Setting" WHERE "key" = 'kul.debug';
