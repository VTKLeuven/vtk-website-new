-- DropIndex
DROP INDEX "TicketRefundItem_orderId_idx";

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "contentEditedAt" TIMESTAMP(3),
ADD COLUMN     "contentMdEn" TEXT,
ADD COLUMN     "contentMdNl" TEXT,
ADD COLUMN     "needsYearlyEdit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PageEditorRole" (
    "pageId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "PageEditorRole_pkey" PRIMARY KEY ("pageId","roleId")
);

-- CreateIndex
CREATE INDEX "PageEditorRole_roleId_idx" ON "PageEditorRole"("roleId");

-- AddForeignKey
ALTER TABLE "PageEditorRole" ADD CONSTRAINT "PageEditorRole_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageEditorRole" ADD CONSTRAINT "PageEditorRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
