-- CreateTable
CREATE TABLE "Frontpage" (
    "id" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Frontpage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Frontpage_layout_key" ON "Frontpage"("layout");

-- CreateIndex
CREATE INDEX "Frontpage_active_startsAt_endsAt_idx" ON "Frontpage"("active", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "Frontpage" ADD CONSTRAINT "Frontpage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
