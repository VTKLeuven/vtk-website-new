-- Nakijkmodus voor groepsadressen: per groep "houden" of "weg", zodat iemand
-- zevenhonderd groepen in meerdere keren kan nakijken.
--
-- Wat er met bestaande rijen gebeurt: reviewDecision en reviewedAt blijven
-- NULL, dus elke groep staat als "nog niet nagekeken". Er wordt niets
-- verwijderd; "weg" zet een groep enkel op de lijst om te verwijderen.

-- CreateEnum
CREATE TYPE "MailGroupReview" AS ENUM ('KEEP', 'DELETE');

-- AlterTable
ALTER TABLE "MailGroup" ADD COLUMN "reviewDecision" "MailGroupReview",
ADD COLUMN "reviewedAt" TIMESTAMP(3);
