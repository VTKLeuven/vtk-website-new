-- CreateEnum
CREATE TYPE "EmailPreference" AS ENUM ('UNIVERSITY', 'PERSONAL');

-- CreateEnum
CREATE TYPE "MailCategory" AS ENUM ('FEEST', 'CAREER', 'SPORT', 'EVENEMENTEN', 'ONDERWIJS', 'INTERNATIONAAL', 'EERSTEJAARS', 'BAKSKE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "street" TEXT,
ADD COLUMN     "houseNumber" TEXT,
ADD COLUMN     "bus" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "emailPreference" "EmailPreference" NOT NULL DEFAULT 'UNIVERSITY',
ADD COLUMN     "mailCategories" "MailCategory"[] DEFAULT ARRAY[]::"MailCategory"[];

-- Backfill: existing accounts are already provisioned, so mark them onboarded
-- to keep the onboarding gate from forcing them through the flow on next login.
-- Only genuinely new (self-registered via SSO) users start with onboardedAt NULL.
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP WHERE "onboardedAt" IS NULL;
