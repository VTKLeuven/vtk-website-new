-- CreateEnum
CREATE TYPE "UitleenLineStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "UitleenReservationLine" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "lineStatus" "UitleenLineStatus" NOT NULL DEFAULT 'REQUESTED';

-- Bestaande lijnen erven de beslissing van hun aanvraag: alles wat al beslist
-- is, was in het oude model integraal goedgekeurd of integraal afgewezen. Zonder
-- deze backfill staat elke lijn van een goedgekeurde aanvraag op REQUESTED en
-- valt ze uit de voorraadberekening.
UPDATE "UitleenReservationLine" AS l
SET "lineStatus" = 'APPROVED'
FROM "UitleenReservation" AS r
WHERE r."id" = l."reservationId"
  AND r."status" IN ('APPROVED', 'PICKED_UP', 'RETURNED');

UPDATE "UitleenReservationLine" AS l
SET "lineStatus" = 'REJECTED'
FROM "UitleenReservation" AS r
WHERE r."id" = l."reservationId"
  AND r."status" = 'REJECTED';
