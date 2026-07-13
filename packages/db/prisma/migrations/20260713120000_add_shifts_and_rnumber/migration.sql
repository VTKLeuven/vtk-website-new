-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rNumber" TEXT;

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "participantIds" INTEGER[],
    "name" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "post" "GroupCode",

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftParticipant" (
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payedOut" BOOLEAN NOT NULL,

    CONSTRAINT "ShiftParticipant_pkey" PRIMARY KEY ("shiftId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_rNumber_key" ON "User"("rNumber");

-- AddForeignKey
ALTER TABLE "ShiftParticipant" ADD CONSTRAINT "ShiftParticipant_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftParticipant" ADD CONSTRAINT "ShiftParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

