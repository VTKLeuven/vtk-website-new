-- Burgieclan onder Studies, net als de andere menu-items: ook databases die al
-- geseed zijn moeten hem krijgen, want de seed draait niet bij een deploy.
INSERT INTO "HeaderTabLink" ("id", "tabId", "labelNl", "labelEn", "url", "order")
SELECT gen_random_uuid()::text, t."id", 'Burgieclan', 'Burgieclan', 'https://burgieclan.vtk.be', 0
FROM "HeaderTab" t
WHERE t."code" = 'STUDIES'
ON CONFLICT ("tabId", "url") DO NOTHING;
