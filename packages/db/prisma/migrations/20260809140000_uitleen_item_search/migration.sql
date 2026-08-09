-- Uitleenmateriaal doorzoekbaar maken vanaf /zoeken. "Hebben jullie een beamer"
-- is precies het soort vraag waarmee iemand op de site landt, en tot nu toe
-- leverde die niets op omdat de catalogus enkel in de logistiek-app bestaat.
--
-- Eén kolom en niet twee: `UitleenItem` heeft geen Engelse velden. De naam en de
-- omschrijving staan er in het Nederlands in, dus de dutch-configuratie is de
-- enige die iets zinnigs met de stammen doet.
--
-- Zelfde opzet als `20260808170000_search_vectors`: een trigger houdt de kolom
-- bij (Prisma kent generated columns niet en zou er drift op zien), de gedeelde
-- helper `vtk_search_vector` bepaalt de weging, en een self-update vult de
-- bestaande rijen.

ALTER TABLE "UitleenItem" ADD COLUMN "search" tsvector;

CREATE OR REPLACE FUNCTION vtk_uitleen_item_search_vector() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Geen derde veld: er is enkel een naam en een omschrijving. De categorie
  -- staat in een andere tabel en zou een join in een trigger vragen; die kan
  -- niet vanzelf mee bijwerken wanneer de categorie hernoemd wordt, en een index
  -- die stil achterloopt is erger dan een categorie die niet meezoekt.
  NEW."search" := vtk_search_vector('dutch', NEW."name", NEW."description", NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "UitleenItem_search_vector"
BEFORE INSERT OR UPDATE ON "UitleenItem"
FOR EACH ROW EXECUTE FUNCTION vtk_uitleen_item_search_vector();

UPDATE "UitleenItem" SET "name" = "name";

-- CreateIndex
CREATE INDEX "UitleenItem_search_idx" ON "UitleenItem" USING GIN ("search");
