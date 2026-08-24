-- Keep alumni separate from `notStudying`: that field also includes members who
-- stopped studying without graduating.
ALTER TYPE "CalendarAudience" ADD VALUE IF NOT EXISTS 'ALUMNI';

ALTER TABLE "User"
ADD COLUMN "alumni" BOOLEAN NOT NULL DEFAULT false;
