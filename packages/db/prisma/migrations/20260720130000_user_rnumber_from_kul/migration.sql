-- Provenance van het r-nummer: true als het van de KU Leuven-authenticator komt
-- (bij SSO gezet). Dan is het veld read-only in het profielformulier, net als de
-- e-mail; een zelf ingevuld r-nummer blijft aanpasbaar.
ALTER TABLE "User" ADD COLUMN "rNumberFromKul" BOOLEAN NOT NULL DEFAULT false;
