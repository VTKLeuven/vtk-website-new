-- PAL+: een aanbod zegt niet meer wanneer de tutor "meestal" kan (een weekrooster
-- met dagdelen), maar op welke concrete momenten die ene sessie kan doorgaan.
-- Onderwijs kiest er bij het plannen een uit.
--
-- Wat er met bestaande rijen gebeurt (het rooster stond sinds 5 oktober 2026 op
-- dev.vtk.be):
-- - Een aanbod met een aangeduid rooster houdt dat als tekst in de opmerking
--   ("Kon meestal: di avond (18:00-22:00), ..."), voor een eventuele opmerking
--   die er al stond. Zo ziet Onderwijs nog wat de tutor aanduidde.
-- - De voorgestelde momenten blijven leeg: welke datums de tutor paste, weet
--   niemand. Het scherm toont dan enkel de opmerking.
-- - De dagdelen (`PalPlusDaypart`) verdwijnen: niets verwijst er nog naar, want
--   een aanbod bewaarde zijn rooster als momentopname met naam en uren.

UPDATE "PalPlusRequest" AS r
SET "availabilityNote" = concat_ws(E'\n', 'Kon meestal: ' || g.text, r."availabilityNote")
FROM (
    SELECT p."id",
           string_agg(
               (ARRAY['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'])[(slot ->> 'day')::int]
                   || ' ' || lower(slot ->> 'label')
                   || ' (' || lpad(((slot ->> 'start')::int / 60)::text, 2, '0') || ':' || lpad(((slot ->> 'start')::int % 60)::text, 2, '0')
                   || '-' || lpad(((slot ->> 'end')::int / 60)::text, 2, '0') || ':' || lpad(((slot ->> 'end')::int % 60)::text, 2, '0')
                   || ')',
               ', ' ORDER BY (slot ->> 'day')::int, (slot ->> 'start')::int
           ) AS text
    FROM "PalPlusRequest" AS p
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p."availability") = 'array' THEN p."availability" ELSE '[]'::jsonb END
    ) AS slot
    WHERE p."kind" = 'GIVE'
      AND (slot ->> 'day') ~ '^[1-7]$'
      AND (slot ->> 'start') ~ '^[0-9]+$'
      AND (slot ->> 'end') ~ '^[0-9]+$'
    GROUP BY p."id"
) AS g
WHERE r."id" = g."id";

-- AlterTable
ALTER TABLE "PalPlusRequest" DROP COLUMN "availability",
ADD COLUMN     "proposedMoments" JSONB;

-- DropTable
DROP TABLE "PalPlusDaypart";

-- Een aanbod kan aanvaard zijn voor het moment vastligt ("Aanvaard, moment
-- volgt"). Een nieuwe waarde, dus geen enkele bestaande aanvraag verandert:
-- wat wacht, blijft PENDING, wat gepland is, blijft PLANNED.
ALTER TYPE "PalPlusRequestStatus" ADD VALUE 'ACCEPTED' AFTER 'OPEN';
