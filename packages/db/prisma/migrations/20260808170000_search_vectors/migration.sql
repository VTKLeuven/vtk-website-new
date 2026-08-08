-- Zoeken over infopagina's en kalenderevenementen (/zoeken).
--
-- Postgres full-text in plaats van LIKE '%...%': één tsvector-kolom per taal met
-- een GIN-index erop. Twee kolommen en niet één, omdat de woordstammen per taal
-- verschillen ("cursussen" -> "cursus" kan enkel de dutch-configuratie); de
-- zoekopdracht kiest de kolom die bij de taal van de bezoeker hoort.
--
-- De kolommen worden door een trigger bijgehouden en niet als generated column
-- gedefinieerd: Prisma kent generated columns niet en zou er bij elke volgende
-- `migrate dev` drift op zien. Een trigger is voor Prisma onzichtbaar.

ALTER TABLE "Page" ADD COLUMN "searchNl" tsvector;
ALTER TABLE "Page" ADD COLUMN "searchEn" tsvector;
ALTER TABLE "CalendarEvent" ADD COLUMN "searchNl" tsvector;
ALTER TABLE "CalendarEvent" ADD COLUMN "searchEn" tsvector;

-- De weging is voor beide tabellen gelijk: A = titel, B = korte omschrijving,
-- C = de volledige tekst. Zonder weging weegt een woord dat ergens onderaan een
-- lange pagina staat even zwaar als hetzelfde woord in de titel.
CREATE OR REPLACE FUNCTION vtk_search_vector(config regconfig, a text, b text, c text)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT setweight(to_tsvector(config, coalesce(a, '')), 'A')
      || setweight(to_tsvector(config, coalesce(b, '')), 'B')
      || setweight(to_tsvector(config, coalesce(c, '')), 'C');
$$;

-- De Engelse vector valt terug op het Nederlands wanneer een veld geen Engelse
-- versie heeft. Dat spiegelt `pick()` in de applicatie: een pagina zonder
-- vertaling toont Nederlandse tekst op /en, en hoort daar dus ook vindbaar te
-- zijn. NULLIF vangt het lege tekstveld op dat de editor achterlaat wanneer
-- iemand een vertaling opent en weer leegmaakt.
CREATE OR REPLACE FUNCTION vtk_page_search_vectors() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchNl" := vtk_search_vector(
    'dutch', NEW."titleNl", NEW."excerptNl", NEW."contentMdNl"
  );
  NEW."searchEn" := vtk_search_vector(
    'english',
    coalesce(nullif(NEW."titleEn", ''), NEW."titleNl"),
    coalesce(nullif(NEW."excerptEn", ''), NEW."excerptNl"),
    coalesce(nullif(NEW."contentMdEn", ''), NEW."contentMdNl")
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vtk_calendar_event_search_vectors() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchNl" := vtk_search_vector(
    'dutch', NEW."titleNl", NEW."location", NEW."descriptionNl"
  );
  NEW."searchEn" := vtk_search_vector(
    'english',
    coalesce(nullif(NEW."titleEn", ''), NEW."titleNl"),
    NEW."location",
    coalesce(nullif(NEW."descriptionEn", ''), NEW."descriptionNl")
  );
  RETURN NEW;
END;
$$;

-- Bewust zonder `UPDATE OF <kolommen>`: dan hoeft niemand deze trigger bij te
-- werken wanneer er een tekstveld bijkomt. Het herberekenen kost iets bij elke
-- schrijfactie, maar het gaat om tientallen pagina's en honderden evenementen.
CREATE TRIGGER "Page_search_vectors"
BEFORE INSERT OR UPDATE ON "Page"
FOR EACH ROW EXECUTE FUNCTION vtk_page_search_vectors();

CREATE TRIGGER "CalendarEvent_search_vectors"
BEFORE INSERT OR UPDATE ON "CalendarEvent"
FOR EACH ROW EXECUTE FUNCTION vtk_calendar_event_search_vectors();

-- Bestaande rijen vullen. Een trigger raakt enkel rijen aan die geschreven
-- worden, dus zonder deze stap blijft de index leeg tot iemand elke pagina en
-- elk evenement opnieuw opslaat. De update zet een kolom op zijn eigen waarde:
-- dat verandert niets aan de inhoud (`updatedAt` wordt door Prisma gezet, niet
-- door de database), maar laat de trigger hierboven wel draaien. Zo staat de
-- definitie van de vector op één plek.
UPDATE "Page" SET "titleNl" = "titleNl";
UPDATE "CalendarEvent" SET "titleNl" = "titleNl";

-- CreateIndex
CREATE INDEX "Page_searchNl_idx" ON "Page" USING GIN ("searchNl");

-- CreateIndex
CREATE INDEX "Page_searchEn_idx" ON "Page" USING GIN ("searchEn");

-- CreateIndex
CREATE INDEX "CalendarEvent_searchNl_idx" ON "CalendarEvent" USING GIN ("searchNl");

-- CreateIndex
CREATE INDEX "CalendarEvent_searchEn_idx" ON "CalendarEvent" USING GIN ("searchEn");
