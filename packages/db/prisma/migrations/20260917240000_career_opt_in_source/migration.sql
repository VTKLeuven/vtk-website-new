-- CreateEnum
CREATE TYPE "CareerOptInSource" AS ENUM ('ONBOARDING', 'ACCOUNT', 'STUDY_CONFIRMATION');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "careerOptInAt" TIMESTAMPTZ(3),
ADD COLUMN     "careerOptInSource" "CareerOptInSource";
