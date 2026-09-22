-- Accounts die niet zichzelf registreerden, gelden als bevestigd.
--
-- better-auth koppelt een KU Leuven-login enkel aan een bestaand account met
-- `emailVerified = true` (`requireLocalEmailVerified`, standaard aan). Dat
-- beschermt tegen iemand die een account aanmaakt op het adres van een ander en
-- wacht tot die via KU Leuven inlogt. Maar `createUser` zette de vlag nooit, en
-- de kolom kwam er met `DEFAULT false` bij de overstap naar better-auth. Elk
-- account van een beheerder en elk account van daarvoor kon dus nooit aan een
-- KU Leuven-login gekoppeld worden: het lid kreeg een foutmelding op /inloggen.
--
-- Volgens het schema betekent `emailVerified` enkel iets bij een zelfgemaakt
-- account (`selfRegisteredAt`); die blijven hier dus onaangeroerd, want daar is
-- de bescherming precies voor. Een verwijderd account blijft ook zoals het is:
-- dat is geanonimiseerd en hoort nergens meer aan te hangen.
--
-- Bijwerking: de SSO-claim `email_verified` wordt voor deze accounts `true`.
-- Dat klopt met wat het betekent: een beheerder zette dat adres.
UPDATE "User"
SET "emailVerified" = true
WHERE "emailVerified" = false
  AND "selfRegisteredAt" IS NULL
  AND "deletedAt" IS NULL;
