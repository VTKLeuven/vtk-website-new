-- CreateTable
CREATE TABLE "UrenloopDownloadEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrenloopDownloadEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UrenloopDownloadEmail_email_key" ON "UrenloopDownloadEmail"("email");

-- CreateIndex
CREATE INDEX "UrenloopDownloadEmail_email_idx" ON "UrenloopDownloadEmail"("email");

-- AddForeignKey
ALTER TABLE "UrenloopDownloadEmail" ADD CONSTRAINT "UrenloopDownloadEmail_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UrenloopDownloadCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrenloopDownloadCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UrenloopDownloadCode_email_createdAt_idx" ON "UrenloopDownloadCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "UrenloopDownloadCode_expiresAt_idx" ON "UrenloopDownloadCode"("expiresAt");
