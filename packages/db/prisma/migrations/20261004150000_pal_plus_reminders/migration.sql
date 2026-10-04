-- De herinnering van de dag voor een PAL+-sessie: per tutor en per
-- ingeschrevene wanneer ze vertrok (of afgehandeld werd omdat ze niet meer
-- zinvol was). Nullable en zonder backfill: PAL+ komt in dezelfde release als
-- deze kolommen, dus er staan nog geen sessies in productie. Een rij zonder
-- waarde krijgt de herinnering wanneer haar sessie binnen 24 uur begint.

-- AlterTable
ALTER TABLE "PalPlusSessionAttendee" ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PalPlusSessionTutor" ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);
