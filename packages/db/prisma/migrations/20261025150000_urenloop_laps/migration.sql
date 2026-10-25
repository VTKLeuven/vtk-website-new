-- De rondes van de 24 urenloop per loper, zodat een loper ze in zijn account
-- ziet. Twee nieuwe tabellen, dus nul rijen: er verschijnt pas iets nadat Sport
-- laps.csv oplaadt in /admin/24urenloop.

-- CreateTable
CREATE TABLE "UrenloopEdition" (
    "year" INTEGER NOT NULL,
    "eventStart" TIMESTAMPTZ(3) NOT NULL,
    "fileName" TEXT,
    "importedById" TEXT,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrenloopEdition_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "UrenloopLap" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "runnerKey" TEXT NOT NULL,
    "rNumber" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "raining" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,

    CONSTRAINT "UrenloopLap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UrenloopLap_rNumber_idx" ON "UrenloopLap"("rNumber");

-- CreateIndex
CREATE INDEX "UrenloopLap_year_runnerKey_idx" ON "UrenloopLap"("year", "runnerKey");

-- CreateIndex
CREATE UNIQUE INDEX "UrenloopLap_year_sequence_key" ON "UrenloopLap"("year", "sequence");

-- AddForeignKey
ALTER TABLE "UrenloopEdition" ADD CONSTRAINT "UrenloopEdition_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrenloopLap" ADD CONSTRAINT "UrenloopLap_year_fkey" FOREIGN KEY ("year") REFERENCES "UrenloopEdition"("year") ON DELETE CASCADE ON UPDATE CASCADE;

