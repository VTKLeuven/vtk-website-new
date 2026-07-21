
-- CreateTable
CREATE TABLE "ssoAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,

    CONSTRAINT "ssoAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ssoAuditLog_createdAt_idx" ON "ssoAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ssoAuditLog_clientId_idx" ON "ssoAuditLog"("clientId");

-- AddForeignKey
ALTER TABLE "ssoAuditLog" ADD CONSTRAINT "ssoAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

