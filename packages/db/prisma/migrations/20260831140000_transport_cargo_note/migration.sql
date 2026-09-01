-- Wat er mee moet op een rit ("20 bierbakken en 4 tafels"), los van waarvóór de
-- rit dient (P4). Een rit die geen levering is, heeft geen materiaalaanvraag met
-- een inhoudslijst, en de chauffeur moet weten of hij de kar of de auto neemt.
ALTER TABLE "UitleenTransportBooking" ADD COLUMN "cargoNote" TEXT;
