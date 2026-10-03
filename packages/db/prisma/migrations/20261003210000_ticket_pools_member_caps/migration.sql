-- Plaatsen met een plafond voor leden en niet-leden, en potten in sjablonen.
-- Zie docs/design-decisions.md, "Plaatsen: potten met een plafond voor leden".

-- Een pot kan hoogstens zoveel plaatsen aan leden of aan niet-leden geven.
-- Bestaande potten krijgen geen plafond: daar verandert niets.
ALTER TABLE "TicketInventoryPool" ADD COLUMN "memberCapacity" INTEGER;
ALTER TABLE "TicketInventoryPool" ADD COLUMN "nonMemberCapacity" INTEGER;
ALTER TABLE "TicketInventoryPool" ADD COLUMN "memberReservedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketInventoryPool" ADD COLUMN "memberSoldCount" INTEGER NOT NULL DEFAULT 0;

-- Telt een bestelde plaats als ledenplaats? Voor bestaande bestellingen weten we
-- dat enkel zeker van een ticket aan de ledenprijs of van een ticket dat enkel
-- voor leden was; of de koper van een gewoon ticket toen lid was, is niet
-- bewaard. Die blijven dus niet-lid. Dat raakt niemand zolang er geen plafond
-- staat, en geen enkele bestaande pot heeft er een.
ALTER TABLE "TicketOrderItem" ADD COLUMN "memberSeat" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TicketOrderItem" i
SET "memberSeat" = true
FROM "TicketType" t
WHERE t."id" = i."ticketTypeId"
  AND (i."memberPrice" = true OR t."audience" = 'MEMBERS');

-- De ledentellers volgen dezelfde regels als `reservedCount` en `soldCount`:
-- gereserveerd zolang de bestelling op betaling wacht, verkocht zodra ze betaald
-- is en tot het ticket terugbetaald wordt. Begrensd op de bestaande totalen, zodat
-- een pot waarvan de tellers ooit afweken nooit meer leden dan plaatsen telt.
WITH member_seats AS (
  SELECT
    i."inventoryPoolId" AS "poolId",
    COUNT(*) FILTER (WHERE o."status" = 'PENDING_PAYMENT') AS reserved,
    COUNT(*) FILTER (
      WHERE o."status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND (tk."status" IS NULL OR tk."status" <> 'REFUNDED')
    ) AS sold
  FROM "TicketOrderItem" i
  JOIN "TicketOrder" o ON o."id" = i."orderId"
  LEFT JOIN "Ticket" tk ON tk."orderItemId" = i."id"
  WHERE i."memberSeat" = true
  GROUP BY i."inventoryPoolId"
)
UPDATE "TicketInventoryPool" p
SET
  "memberReservedCount" = LEAST(m.reserved, p."reservedCount"),
  "memberSoldCount" = LEAST(m.sold, p."soldCount")
FROM member_seats m
WHERE m."poolId" = p."id";

-- Sjablonen: de potten als JSON, en per ticket de pot waar het van afgaat.
-- Leeg = één pot met `capacity`, precies wat een sjabloon tot nu toe maakte.
ALTER TABLE "TicketEventTemplate" ADD COLUMN "pools" JSONB;
ALTER TABLE "TicketEventTemplateType" ADD COLUMN "poolCode" TEXT;
