-- De uitleendienst (apps/logistiek) draait op een eigen host en was nergens
-- vanaf de hoofdsite gelinkt. Ze hoort in het uitklapmenu van de Info-tab, naast
-- Kalender en Piano.
--
-- Net als bij die twee moet dit ook in databases terechtkomen die al geseed
-- waren: de seed maakt HeaderTabLinks enkel aan op een verse database en draait
-- niet bij een deploy. Matchen op `code` (AANBOD, de tab die op het scherm "Info"
-- heet), want labels en slug zijn admin-beheerd. Bestaande items blijven staan
-- dankzij de unieke index op (tabId, url).
INSERT INTO "HeaderTabLink" ("id", "tabId", "labelNl", "labelEn", "url", "order")
SELECT gen_random_uuid()::text, t."id", 'Uitleendienst', 'Equipment service', 'https://logistiek.vtk.be', 2
FROM "HeaderTab" t
WHERE t."code" = 'AANBOD'
ON CONFLICT ("tabId", "url") DO NOTHING;
