-- Vriendjesbureau: een bureau waar wie een vriendje meeneemt (iemand die nog
-- nooit of maar één keer op bureau was) en dat vriendje allebei iets krijgen.
-- Bij het inschrijven duidt een student van de faculteit aan of die een
-- vriendje meeneemt of er een is. Zie docs/design-decisions.md.
--
-- Wat er met bestaande rijen gebeurt: elk bestaand bureau en elke GM krijgt
-- `friendsBureau = false` en blijft een gewoon moment. Elke bestaande
-- inschrijving krijgt `friendRole = NULL`: de vraag werd haar nooit gesteld, en
-- het scherm toont daar niets. Geen backfill.

-- CreateEnum
CREATE TYPE "MeetingFriendRole" AS ENUM ('BRINGS_FRIEND', 'IS_FRIEND');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "friendsBureau" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MeetingReservation" ADD COLUMN "friendRole" "MeetingFriendRole";
