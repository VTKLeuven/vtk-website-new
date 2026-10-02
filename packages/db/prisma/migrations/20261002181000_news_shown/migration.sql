-- Automatische berichten die standaard niet in het nieuws staan (de
-- ticketverkoop van een werkgroep), maar die de redactie er toch in zette.
-- Begint leeg: een werkgroepverkoop die nu in het nieuws staat, valt eruit tot
-- iemand ze er in /admin/nieuws terug in zet. Dat is de bedoeling.

CREATE TABLE "NewsShown" (
    "source" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsShown_pkey" PRIMARY KEY ("source","ref")
);
