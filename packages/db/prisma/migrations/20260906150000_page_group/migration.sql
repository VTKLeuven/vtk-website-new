-- De post achter een contentpagina.
--
-- Een pagina die bij een werking hoort (Sport, Internationaal, Cursusdienst)
-- toont voortaan wat die werking doet: haar eerstvolgende evenementen, haar
-- ploeg van dit werkingsjaar en haar website. Zonder koppeling verandert er
-- niets: een FAQ of een woordenlijst hoort bij geen enkele post en toont die
-- blokken gewoon niet.
--
-- SetNull en niet Cascade: een post die opgeheven wordt, mag de pagina niet
-- meenemen. Die verliest enkel haar werkingsblokken.

ALTER TABLE "Page" ADD COLUMN "groupId" TEXT;

CREATE INDEX "Page_groupId_idx" ON "Page"("groupId");

ALTER TABLE "Page"
  ADD CONSTRAINT "Page_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
