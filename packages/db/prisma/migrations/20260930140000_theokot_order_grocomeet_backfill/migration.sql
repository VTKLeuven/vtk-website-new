-- Wat grocos al bij Theokot bestelden vóór de GM-doos bestond, gaat er alsnog in.
--
-- De vorige migratie liet bestaande bestellingen gewone bestellingen; de eerste
-- vrijdag met een grocomeet had toen al bestellingen van grocos (een broodje van
-- de week), en die horen in de doos. Dezelfde regel als in de code
-- (`placeOrder`, `linkGrocomeetOrders`):
--
-- - enkel wat nog openstaat: `RESERVED`, op een verkoopdag die nog niet
--   verwerkt is en niet voorbij, en nog niet aan een grocomeet gekoppeld;
-- - enkel op een dag met een grocomeet (bij twee op één dag de eerste);
-- - enkel wie `grocomeet.reserve` heeft in het huidige werkingsjaar (vanaf
--   15 juli, zie `currentWorkingYear`), via een eigen rol of via een post, waarbij
--   een LEADER-toekenning enkel voor de lead telt. Zoals `hasLivePermission`
--   geen uitzondering voor een superadmin.
--
-- Wat al afgehaald of als no-show geboekt is, verandert niet. Opnieuw draaien
-- verandert niets meer: alles wat past, heeft dan al een grocomeet.
WITH working_year AS (
  SELECT GREATEST(
    2026,
    CASE
      WHEN to_char(now() AT TIME ZONE 'Europe/Brussels', 'MM-DD') >= '07-15'
        THEN extract(year FROM now() AT TIME ZONE 'Europe/Brussels')::int
      ELSE extract(year FROM now() AT TIME ZONE 'Europe/Brussels')::int - 1
    END
  ) AS year
),
grocos AS (
  SELECT ur."userId"
  FROM "UserRole" ur
  JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
  JOIN "Permission" p ON p.id = rp."permissionId"
  WHERE p.code = 'grocomeet.reserve'
    AND ur.year = (SELECT year FROM working_year)
  UNION
  SELECT gm."userId"
  FROM "GroupMembership" gm
  JOIN "GroupRole" gr ON gr."groupId" = gm."groupId"
  JOIN "RolePermission" rp ON rp."roleId" = gr."roleId"
  JOIN "Permission" p ON p.id = rp."permissionId"
  WHERE p.code = 'grocomeet.reserve'
    AND gm.year = (SELECT year FROM working_year)
    AND (gr.kind = 'DEFAULT' OR gm.role = 'LEAD')
),
grocomeet_days AS (
  SELECT DISTINCT ON (day) day, id
  FROM (
    SELECT (m."startsAt" AT TIME ZONE 'Europe/Brussels')::date AS day, m.id, m."startsAt"
    FROM "Meeting" m
    WHERE m.kind = 'GROCOMEET'
  ) meetings
  ORDER BY day, "startsAt"
)
UPDATE "TheokotOrder" o
SET "grocomeetId" = g.id
FROM "TheokotSession" s, grocomeet_days g
WHERE o."sessionId" = s.id
  AND o.status = 'RESERVED'
  AND o."grocomeetId" IS NULL
  AND s."processedAt" IS NULL
  -- `TheokotSession.date` is een tijdstip zonder zone in UTC: Brussel-middernacht.
  AND ((s.date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Brussels')::date = g.day
  AND g.day >= (now() AT TIME ZONE 'Europe/Brussels')::date
  AND o."userId" IN (SELECT "userId" FROM grocos);
