-- Een rit die de levering van een materiaalaanvraag is.
--
-- "Levering nodig" was tot nu toe enkel een vinkje op de aanvraag: het maakte
-- geen rit aan en kwam dus nooit in het vervoerbeheer terecht. Logistiek maakt
-- de rit nu vanaf de aanvraag; deze kolom houdt de twee aan elkaar, zodat je
-- vanaf de aanvraag ziet dat de levering geregeld is en vanaf de rit weet
-- waarvoor ze dient.
--
-- SET NULL en niet CASCADE: verdwijnt de aanvraag, dan blijft de rit bestaan.
-- Het voertuig is die dag nog altijd bezet, en een boeking laten verdampen omdat
-- iemand de aanvraag opruimt zou een gat in de planning slaan.
ALTER TABLE "UitleenTransportBooking" ADD COLUMN "reservationId" TEXT;

CREATE INDEX "UitleenTransportBooking_reservationId_idx"
  ON "UitleenTransportBooking"("reservationId");

ALTER TABLE "UitleenTransportBooking"
  ADD CONSTRAINT "UitleenTransportBooking_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "UitleenReservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
