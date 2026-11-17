-- Leden van een werkgroep die geen werkgroepaccount nodig hebben. Nieuwe tabel:
-- niemand staat bij het uitrollen als "niet nodig"; de werkgroep of IT duidt dat
-- zelf aan op /admin/groepsadressen/aanvragen.
CREATE TABLE "WerkgroepAccountSkip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WerkgroepAccountSkip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WerkgroepAccountSkip_userId_groupId_key" ON "WerkgroepAccountSkip"("userId", "groupId");
CREATE INDEX "WerkgroepAccountSkip_groupId_idx" ON "WerkgroepAccountSkip"("groupId");

ALTER TABLE "WerkgroepAccountSkip" ADD CONSTRAINT "WerkgroepAccountSkip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WerkgroepAccountSkip" ADD CONSTRAINT "WerkgroepAccountSkip_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
