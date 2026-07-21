-- Tokens en toestemmingen hebben geen betekenis zonder hun client, maar de
-- foreign keys hielden een verwijdering tegen (oauthConsent_clientId_fkey).
-- Cascade zet dat recht op databaseniveau, zodat elk verwijderpad klopt en niet
-- alleen dat van onze eigen functie.
--
-- De audit-log heeft bewust GEEN foreign key naar oauthClient en blijft dus
-- staan; dat is net de bedoeling bij een verwijderde client.

-- DropForeignKey
ALTER TABLE "oauthAccessToken" DROP CONSTRAINT "oauthAccessToken_clientId_fkey";

-- DropForeignKey
ALTER TABLE "oauthConsent" DROP CONSTRAINT "oauthConsent_clientId_fkey";

-- DropForeignKey
ALTER TABLE "oauthRefreshToken" DROP CONSTRAINT "oauthRefreshToken_clientId_fkey";

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
