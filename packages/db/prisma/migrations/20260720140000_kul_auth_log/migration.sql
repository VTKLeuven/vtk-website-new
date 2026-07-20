-- KU Leuven SSO (OIDC) debug log.
-- Opt-in via Admin -> IT (Setting-sleutel "kul.debug"): één rij per KU Leuven-
-- login met de ruwe claims die better-auth aan mapProfileToUser doorgeeft, zodat
-- een superadmin kan zien welke attributen ICTS vrijgeeft (bv. of
-- KULeuvenEmployeeType/faculteit binnenkomt). Bevat persoonsgegevens, staat
-- standaard uit en wordt tot de laatste N rijen gesnoeid.

-- CreateTable
CREATE TABLE "KulAuthLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "rNumber" TEXT,
    "claims" JSONB NOT NULL,

    CONSTRAINT "KulAuthLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KulAuthLog_at_idx" ON "KulAuthLog"("at");
