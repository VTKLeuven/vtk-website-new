-- Openstaande Theokot-bestellingen op de prijs van nu.
--
-- Sinds september 2026 zet "Aanbod bewerken" elke openstaande reservatie van die
-- dag op de nieuwe prijs (`repriceReservedOrders`). Een prijs die gewijzigd werd
-- voor die code live stond, of bij een opslag die halverwege afbrak, liet de
-- reservatie op de oude prijs staan: een student zag 2,80 in zijn reservatie
-- terwijl het broodje op het bord 3,00 kostte.
--
-- Bestaande rijen: enkel bestellingen die nog niet betaald zijn (RESERVED en
-- NO_SHOW) krijgen de prijs die hun broodje nu heeft, en hun totaal wordt
-- herberekend. Een opgehaalde (PICKED_UP) of geannuleerde bestelling blijft
-- exact staan: daar is betaald wat er toen stond. Geen schemawijziging.

UPDATE "TheokotOrderLine" AS line
SET "unitPriceCents" = item."priceCents"
FROM "TheokotSessionItem" AS item, "TheokotOrder" AS o
WHERE line."sessionItemId" = item."id"
  AND line."orderId" = o."id"
  AND o."status" IN ('RESERVED', 'NO_SHOW')
  AND line."unitPriceCents" <> item."priceCents";

UPDATE "TheokotOrder" AS o
SET "totalCents" = sums."total"
FROM (
  SELECT line."orderId", SUM(line."quantity" * line."unitPriceCents")::int AS "total"
  FROM "TheokotOrderLine" AS line
  GROUP BY line."orderId"
) AS sums
WHERE sums."orderId" = o."id"
  AND o."status" IN ('RESERVED', 'NO_SHOW')
  AND o."totalCents" <> sums."total";
