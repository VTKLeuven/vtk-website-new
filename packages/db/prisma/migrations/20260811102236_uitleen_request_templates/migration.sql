-- CreateTable
CREATE TABLE "UitleenRequestTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "groupId" TEXT,
    "createdById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UitleenRequestTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UitleenRequestTemplateLine" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UitleenRequestTemplateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UitleenRequestTemplate_active_sortIndex_idx" ON "UitleenRequestTemplate"("active", "sortIndex");

-- CreateIndex
CREATE INDEX "UitleenRequestTemplateLine_itemId_idx" ON "UitleenRequestTemplateLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "UitleenRequestTemplateLine_templateId_itemId_key" ON "UitleenRequestTemplateLine"("templateId", "itemId");

-- AddForeignKey
ALTER TABLE "UitleenRequestTemplate" ADD CONSTRAINT "UitleenRequestTemplate_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenRequestTemplate" ADD CONSTRAINT "UitleenRequestTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenRequestTemplateLine" ADD CONSTRAINT "UitleenRequestTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "UitleenRequestTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UitleenRequestTemplateLine" ADD CONSTRAINT "UitleenRequestTemplateLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
