-- De zes jaarwerkingen van VTK, elk met een eigen rol die aan elk lid hangt,
-- zoals de seed dat voor elke werkgroep doet (`werkgroep-<code>`). Die rol is
-- een lege container: rechten hang je er later aan in /admin/roles.
--
-- Eenmalig en create-only: wat er al staat (een code, slug of rol met dezelfde
-- naam) blijft ongemoeid. Daarna zijn ze GUI-beheerd op /admin/jaarwerkingen:
-- hernoemen, deactiveren of een zevende toevoegen gebeurt daar, niet hier.
-- Geen leden: de ploeg van een werkingsjaar duidt het beheer aan.

INSERT INTO "Group" ("id", "code", "slug", "nameNl", "nameEn", "orderInPraesidium", "type", "leadLabel", "active")
VALUES
  ('grp-kanweek', 'KANWEEK', 'kanweek', 'Kanweek', 'Kanweek', 0, 'JAARWERKING', 'Verantwoordelijke', true),
  ('grp-halftime', 'HALFTIME', 'halftime', 'Halftime', 'Halftime', 1, 'JAARWERKING', 'Verantwoordelijke', true),
  ('grp-parttime', 'PARTTIME', 'parttime', 'Parttime', 'Parttime', 2, 'JAARWERKING', 'Verantwoordelijke', true),
  ('grp-fulltime', 'FULLTIME', 'fulltime', 'Fulltime', 'Fulltime', 3, 'JAARWERKING', 'Verantwoordelijke', true),
  ('grp-duplex', 'DUPLEX', 'duplex', 'Duplex', 'Duplex', 4, 'JAARWERKING', 'Verantwoordelijke', true),
  ('grp-triplex', 'TRIPLEX', 'triplex', 'Triplex', 'Triplex', 5, 'JAARWERKING', 'Verantwoordelijke', true)
ON CONFLICT DO NOTHING;

INSERT INTO "Role" ("id", "code", "nameNl", "nameEn", "descriptionNl", "descriptionEn", "order", "system", "createdAt", "updatedAt")
VALUES
  ('role-jaarwerking-kanweek', 'jaarwerking-kanweek', 'Kanweek', 'Kanweek', 'Rol voor jaarwerking Kanweek.', 'Role for the Kanweek yearly event.', 50, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-jaarwerking-halftime', 'jaarwerking-halftime', 'Halftime', 'Halftime', 'Rol voor jaarwerking Halftime.', 'Role for the Halftime yearly event.', 51, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-jaarwerking-parttime', 'jaarwerking-parttime', 'Parttime', 'Parttime', 'Rol voor jaarwerking Parttime.', 'Role for the Parttime yearly event.', 52, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-jaarwerking-fulltime', 'jaarwerking-fulltime', 'Fulltime', 'Fulltime', 'Rol voor jaarwerking Fulltime.', 'Role for the Fulltime yearly event.', 53, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-jaarwerking-duplex', 'jaarwerking-duplex', 'Duplex', 'Duplex', 'Rol voor jaarwerking Duplex.', 'Role for the Duplex yearly event.', 54, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-jaarwerking-triplex', 'jaarwerking-triplex', 'Triplex', 'Triplex', 'Rol voor jaarwerking Triplex.', 'Role for the Triplex yearly event.', 55, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Elke jaarwerking kent haar eigen rol toe aan elk lid (DEFAULT).
INSERT INTO "GroupRole" ("groupId", "roleId", "kind")
SELECT grp."id", role."id", 'DEFAULT'
FROM "Group" AS grp
JOIN "Role" AS role ON role."code" = 'jaarwerking-' || lower(grp."code")
WHERE grp."type" = 'JAARWERKING'
  AND grp."code" IN ('KANWEEK', 'HALFTIME', 'PARTTIME', 'FULLTIME', 'DUPLEX', 'TRIPLEX')
ON CONFLICT ("groupId", "roleId", "kind") DO NOTHING;
