-- Feedback van leden over de website zelf.
--
-- Het formulier hangt in het accountmenu, dus er is altijd een sessie. Toch is
-- `authorId` nullable: wie anoniem meldt, wordt niet weggeschreven. Dat is de
-- hele belofte van dat vinkje; een kolom die stiekem toch ingevuld blijft,
-- maakt er een leugen van.
--
-- SetNull aan beide kanten: een melding overleeft het account van haar melder
-- en dat van de behandelaar.

CREATE TYPE "WebsiteFeedbackKind" AS ENUM ('BUG', 'CONTENT', 'DESIGN', 'FEATURE', 'OTHER');
CREATE TYPE "WebsiteFeedbackStatus" AS ENUM ('NEW', 'PLANNED', 'DONE', 'DISMISSED');

CREATE TABLE "WebsiteFeedback" (
    "id" TEXT NOT NULL,
    "kind" "WebsiteFeedbackKind" NOT NULL,
    "message" TEXT NOT NULL,
    "imageKey" TEXT,
    "path" TEXT,
    "userAgent" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "status" "WebsiteFeedbackStatus" NOT NULL DEFAULT 'NEW',
    "handledById" TEXT,
    "handledAt" TIMESTAMPTZ(3),
    "handlingNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebsiteFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteFeedback_status_createdAt_idx" ON "WebsiteFeedback"("status", "createdAt");
CREATE INDEX "WebsiteFeedback_kind_idx" ON "WebsiteFeedback"("kind");
CREATE INDEX "WebsiteFeedback_authorId_idx" ON "WebsiteFeedback"("authorId");
CREATE INDEX "WebsiteFeedback_handledById_idx" ON "WebsiteFeedback"("handledById");

ALTER TABLE "WebsiteFeedback"
  ADD CONSTRAINT "WebsiteFeedback_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebsiteFeedback"
  ADD CONSTRAINT "WebsiteFeedback_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
