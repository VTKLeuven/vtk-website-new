ALTER TABLE "ShiftParticipant"
ADD COLUMN "rewardPaid" INTEGER NOT NULL DEFAULT 0;

UPDATE "ShiftParticipant" AS participant
SET "rewardPaid" = GREATEST(shift."reward", 0)
FROM "Shift" AS shift
WHERE participant."shiftId" = shift."id"
  AND participant."payedOut" = TRUE;

ALTER TABLE "ShiftParticipant"
ADD CONSTRAINT "ShiftParticipant_rewardPaid_nonnegative"
CHECK ("rewardPaid" >= 0);

CREATE TABLE "TheokotVoucherRedemption" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processedById" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TheokotVoucherRedemption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TheokotVoucherRedemption_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "TheokotVoucherRedemption_orderId_key"
ON "TheokotVoucherRedemption"("orderId");

CREATE INDEX "TheokotVoucherRedemption_userId_createdAt_idx"
ON "TheokotVoucherRedemption"("userId", "createdAt");

CREATE INDEX "TheokotVoucherRedemption_createdAt_idx"
ON "TheokotVoucherRedemption"("createdAt");

ALTER TABLE "TheokotVoucherRedemption"
ADD CONSTRAINT "TheokotVoucherRedemption_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "TheokotOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TheokotVoucherRedemption"
ADD CONSTRAINT "TheokotVoucherRedemption_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TheokotVoucherRedemption"
ADD CONSTRAINT "TheokotVoucherRedemption_processedById_fkey"
FOREIGN KEY ("processedById") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
