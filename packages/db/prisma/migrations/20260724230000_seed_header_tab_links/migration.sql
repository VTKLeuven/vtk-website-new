-- De menu-items voor Career en Cursusdienst horen in elke database te staan, ook
-- in databases die al geseed waren: de seed maakt ze enkel op een verse database
-- aan en draait niet bij een deploy. Daarom zet deze migratie ze zelf.
--
-- Matchen op `code` en niet op label: labels zijn admin-beheerd en wijken af
-- ("Cursusdienst" kan intussen anders heten). Bestaande items blijven staan
-- dankzij de unieke index op (tabId, url).
INSERT INTO "HeaderTabLink" ("id", "tabId", "labelNl", "labelEn", "url", "order")
SELECT gen_random_uuid()::text, t."id", v.label_nl, v.label_en, v.url, v.ord
FROM "HeaderTab" t
JOIN (
  VALUES
    ('CAREER', 'Jobfair', 'Job fair', 'https://www.career.vtk.be/event/vtk-jobfair', 0),
    ('CAREER', 'Contact voor bedrijven', 'Contact for companies', 'https://www.career.vtk.be/contact', 1),
    ('CURSUSDIENST', 'Bestel boeken', 'Order books', 'https://cudi.vtk.be/vtk/shop', 0),
    ('CURSUSDIENST', 'Tweedehands', 'Second-hand', 'https://cudi.vtk.be/vtk/secondhand', 1),
    ('CURSUSDIENST', 'Printer', 'Printer', 'https://cudi.vtk.be/vtk/printer', 2),
    ('CURSUSDIENST', 'Subsidies', 'Subsidies', 'https://cudi.vtk.be/vtk/subsidies', 3)
) AS v (code, label_nl, label_en, url, ord) ON v.code = t."code"
ON CONFLICT ("tabId", "url") DO NOTHING;
