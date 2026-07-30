-- Het menu-item naar /piano hoort in elke database te staan, ook in databases die
-- al geseed waren: de seed maakt HeaderTabLinks enkel op een verse database aan.
-- Matchen op `code` (AANBOD, de tab die op het scherm "Info" heet), want labels
-- zijn admin-beheerd. Bestaande items blijven staan dankzij de unieke index op
-- (tabId, url).
INSERT INTO "HeaderTabLink" ("id", "tabId", "labelNl", "labelEn", "url", "order")
SELECT gen_random_uuid()::text, t."id", 'Piano reserveren', 'Reserve the piano', '/piano', 0
FROM "HeaderTab" t
WHERE t."code" = 'AANBOD'
ON CONFLICT ("tabId", "url") DO NOTHING;
