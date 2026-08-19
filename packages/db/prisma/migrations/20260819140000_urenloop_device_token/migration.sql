-- CreateTable
CREATE TABLE "UrenloopDeviceToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "appVersion" TEXT,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrenloopDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UrenloopDeviceToken_tokenHash_key" ON "UrenloopDeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UrenloopDeviceToken_email_revokedAt_idx" ON "UrenloopDeviceToken"("email", "revokedAt");
