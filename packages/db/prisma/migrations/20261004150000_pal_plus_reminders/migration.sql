-- De herinnering van de dag voor een PAL+-sessie: per tutor en per
-- ingeschrevene wanneer ze vertrok (of afgehandeld werd omdat ze niet meer
-- zinvol was). Nullable en zonder backfill. Een bestaande rij (PAL+ staat sinds
-- 4 oktober 2026 op dev.vtk.be) krijgt de herinnering zodra haar sessie binnen
-- 24 uur begint; voor een sessie die bij de deploy al binnen dat venster valt,
-- vertrekt ze bij de eerste run van de background-worker. Een sessie die al
-- begonnen is, krijgt er geen.

-- AlterTable
ALTER TABLE "PalPlusSessionAttendee" ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PalPlusSessionTutor" ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);
