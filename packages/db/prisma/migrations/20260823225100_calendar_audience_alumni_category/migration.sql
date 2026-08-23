-- Enum values added by ALTER TYPE can only be used after that migration has
-- committed, hence this deliberately separate migration.
INSERT INTO "CalendarCategory"
  ("id", "slug", "nameNl", "nameEn", "colour", "order", "audience", "showOnCalendarPage", "createdAt", "updatedAt")
VALUES
  ('calendar-category-laatstejaars', 'laatstejaars', 'Laatstejaars', 'Last years', '#F97316', 2, 'LAST_YEARS', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar-category-alumni', 'alumni', 'Alumni', 'Alumni', '#7C3AED', 3, 'ALUMNI', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "audience" = EXCLUDED."audience";
