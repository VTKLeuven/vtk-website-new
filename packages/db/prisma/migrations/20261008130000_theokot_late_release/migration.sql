-- Laat annuleren bij het Theokot: na de deadline worden de broodjes al
-- gemaakt, dus een annulatie wist de bestelling niet meer maar geeft ze vrij
-- voor overname. Wat een ander overneemt, gaat per stuk van de bestelling af;
-- wat bij het sluiten van de afhaal overblijft, telt als no-show.
ALTER TABLE "TheokotOrder" ADD COLUMN "releasedAt" TIMESTAMPTZ(3);
ALTER TABLE "TheokotOrderLine" ADD COLUMN "releasedQuantity" INTEGER NOT NULL DEFAULT 0;
