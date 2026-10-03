-- Boekhoudcodes rechtzetten na het antwoord van de boekhouder. Zie
-- docs/design-decisions.md ("Boekhoudcodes in de betaalinfo").
--
-- Twee dingen waren fout in 20261003120000_accounting_codes:
--
-- 1. Een subcode is een analytische code die de boekhouder in een apart vakje
--    invult, geen verlengstuk van de rekening. Ze staat dus met een spatie
--    achter de hoofdrekening ("700120 12002") en niet aaneen ("70012012002").
-- 2. In de lijst die we kregen, stonden twee reeksen subcodes nog op hun oude
--    nummer: Onthaal (700101) is 10101 tot 10103, niet 10001 tot 10003, en
--    Bedrijvenrelaties (704100) is 41001 tot 41009, niet 10001 tot 10009.

-- De volgorde van de lijst, zodat de penning ze kan slepen zoals in haar
-- rekenblad. Wat er al staat, krijgt de volgorde van de code.
ALTER TABLE "AccountingCode" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- De foute nummers, van de oude naar de nieuwe schrijfwijze. Een code die de
-- penning intussen zelf al juist zette (onder de oude of de nieuwe
-- schrijfwijze), slaan we over: anders botsen ze op de unieke code en faalt de
-- deploy.
CREATE TEMPORARY TABLE accounting_code_fix (old_code TEXT PRIMARY KEY, new_code TEXT NOT NULL);
INSERT INTO accounting_code_fix (old_code, new_code)
VALUES
    ('70010110001', '700101 10101'),
    ('70010110002', '700101 10102'),
    ('70010110003', '700101 10103'),
    ('70410010001', '704100 41001'),
    ('70410010002', '704100 41002'),
    ('70410010003', '704100 41003'),
    ('70410010004', '704100 41004'),
    ('70410010005', '704100 41005'),
    ('70410010006', '704100 41006'),
    ('70410010007', '704100 41007'),
    ('70410010008', '704100 41008'),
    ('70410010009', '704100 41009');

UPDATE "AccountingCode" c
SET "code" = fix.new_code, "updatedAt" = CURRENT_TIMESTAMP
FROM accounting_code_fix fix
WHERE c."code" = fix.old_code
  AND NOT EXISTS (
    SELECT 1 FROM "AccountingCode" taken
    WHERE taken."code" IN (fix.new_code, replace(fix.new_code, ' ', ''))
  );

-- Elke andere subcode naar de nieuwe schrijfwijze, ook die de penning zelf
-- toevoegde: hoofdrekening, spatie, de vijf cijfers.
UPDATE "AccountingCode" c
SET "code" = parent."code" || ' ' || substr(c."code", 7), "updatedAt" = CURRENT_TIMESTAMP
FROM "AccountingCode" parent
WHERE c."parentId" = parent."id"
  AND c."code" ~ '^\d{11}$'
  AND left(c."code", 6) = parent."code";

UPDATE "AccountingCode" c
SET "sortOrder" = ordered.position
FROM (
    SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "parentId" ORDER BY "code") - 1)::INTEGER AS position
    FROM "AccountingCode"
) ordered
WHERE c."id" = ordered."id";

-- Bestellingen en lidgeld die al onder de oude schrijfwijze betaald zijn,
-- krijgen ook de nieuwe. Dat is een bewuste uitzondering op "wat verkocht is,
-- verandert niet mee": hier veranderde niet de keuze van de penning maar onze
-- schrijfwijze, en de foute nummers bestaan niet in de boekhouding. Bleven ze
-- staan, dan telden de statistieken dezelfde rekening twee keer (één keer
-- aaneen, één keer met spatie), en kreeg de penning voor Onthaal en
-- Bedrijvenrelaties een code die ze nergens kan boeken. Op het uittreksel en
-- bij Mollie blijft de oude tekst staan; de betaal-ID van de provider legt de
-- link met de bestelling.
UPDATE "TicketOrder" o
SET "accountingCode" = fix.new_code
FROM accounting_code_fix fix
WHERE o."accountingCode" = fix.old_code;

UPDATE "TicketOrder"
SET "accountingCode" = left("accountingCode", 6) || ' ' || substr("accountingCode", 7)
WHERE "accountingCode" ~ '^\d{11}$';

UPDATE "MembershipPayment" p
SET "accountingCode" = fix.new_code
FROM accounting_code_fix fix
WHERE p."accountingCode" = fix.old_code;

UPDATE "MembershipPayment"
SET "accountingCode" = left("accountingCode", 6) || ' ' || substr("accountingCode", 7)
WHERE "accountingCode" ~ '^\d{11}$';

DROP TABLE accounting_code_fix;
