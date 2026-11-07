-- Jaarwerkingen (Kanweek, Halftime, ...) worden een derde soort Group naast de
-- praesidiumposten en de werkgroepen. In een aparte migratie: Postgres laat een
-- nieuwe enumwaarde niet gebruiken in dezelfde transactie die ze toevoegt, en de
-- volgende migratie maakt de jaarwerkingen aan.
ALTER TYPE "GroupType" ADD VALUE IF NOT EXISTS 'JAARWERKING';
