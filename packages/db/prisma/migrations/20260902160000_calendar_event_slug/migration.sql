-- Publieke URL-naam voor kalenderevents: /kalender/galabal-2026 in plaats van
-- /kalender/<cuid>. De kolom wordt eerst nullable gezet, dan gevuld en pas
-- daarna verplicht gemaakt; op een bestaande rij faalt NOT NULL anders meteen.

ALTER TABLE "CalendarEvent" ADD COLUMN "slug" TEXT;

-- Dezelfde regels als slugify() in packages/db/src/slug.ts. De twee reeksen in
-- translate() zijn gegenereerd uit Unicode: het zijn precies de kleine letters
-- die NFKD daar tot een ASCII-letter herleidt, zodat een backfill-slug niet kan
-- afwijken van wat de admin later voor dezelfde titel maakt. Al de rest (ø, ß,
-- emoji, een niet-latijns schrift) wordt een koppelteken, ook daar net als in
-- TypeScript.
CREATE OR REPLACE FUNCTION pg_temp.vtk_slugify(input text) RETURNS text AS $$
  SELECT trim(both '-' from regexp_replace(
    translate(
      lower(input),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżžſơưǎǐǒǔǖǘǚǜǟǡǧǩǫǭǰǵǹǻȁȃȅȇȉȋȍȏȑȓȕȗșțȟȧȩȫȭȯȱȳʰʲʳʷʸˡˢˣ',
      'aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzzsouaiouuuuuaagkoojgnaaaeeiioorruusthaeooooyhjrwylsx'
    ),
    '[^a-z0-9]+', '-', 'g'
  ))
$$ LANGUAGE sql IMMUTABLE;

-- Titel plus het jaartal in Brusselse tijd. Eerst afkappen op 60 tekens en dan
-- pas het streepje wegtrimmen, anders eindigt een lange titel op "--2026" en
-- voldoet de slug niet meer aan het patroon dat de action afdwingt. Blijft er
-- niets over, dan "evenement", net als in eventSlugBase().
UPDATE "CalendarEvent"
SET "slug" =
  COALESCE(
    NULLIF(trim(both '-' from left(pg_temp.vtk_slugify("titleNl"), 60)), ''),
    'evenement'
  )
  || '-'
  -- Twee keer AT TIME ZONE, en dat is geen vergissing: `start` is een
  -- `timestamp without time zone` waar UTC in staat. De eerste stap plakt daar
  -- UTC op, de tweede rekent om naar Brusselse kloktijd. Met enkel de tweede zou
  -- Postgres de waarde als Brusselse tijd lezen en krijgt een receptie van
  -- 1 januari 00u30 het jaartal 2025 mee.
  || to_char(("start" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Brussels', 'YYYY');

-- Events en categorieen delen het routesegment [slugOrId], dus een event mag
-- geen bestaande categorieslug overnemen. Door het jaartal is dat praktisch
-- onmogelijk, maar de kolom wordt hieronder uniek en NOT NULL: hier stil
-- misgaan kost een mislukte deploy.
UPDATE "CalendarEvent" e
SET "slug" = e."slug" || '-event'
WHERE EXISTS (SELECT 1 FROM "CalendarCategory" c WHERE c."slug" = e."slug");

-- Twee events met dezelfde titel in hetzelfde jaar (een wekelijkse activiteit)
-- krijgen een teller. Oudste eerst, zodat de nummering stabiel is en de oudste
-- de kale naam houdt.
WITH ranked AS (
  SELECT "id", "slug",
         row_number() OVER (PARTITION BY "slug" ORDER BY "createdAt", "id") AS rn
  FROM "CalendarEvent"
)
UPDATE "CalendarEvent" e
SET "slug" = ranked."slug" || '-' || ranked.rn
FROM ranked
WHERE e."id" = ranked."id" AND ranked.rn > 1;

ALTER TABLE "CalendarEvent" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "CalendarEvent_slug_key" ON "CalendarEvent"("slug");
