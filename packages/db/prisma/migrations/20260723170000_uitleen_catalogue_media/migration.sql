CREATE TABLE "UitleenItemPhoto" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UitleenItemPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UitleenItemProperty" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UitleenItemProperty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UitleenItemDownload" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UitleenItemDownload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UitleenItemPhoto_itemId_sortIndex_idx" ON "UitleenItemPhoto"("itemId", "sortIndex");
CREATE INDEX "UitleenItemProperty_itemId_sortIndex_idx" ON "UitleenItemProperty"("itemId", "sortIndex");
CREATE INDEX "UitleenItemDownload_itemId_sortIndex_idx" ON "UitleenItemDownload"("itemId", "sortIndex");

ALTER TABLE "UitleenItemPhoto" ADD CONSTRAINT "UitleenItemPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UitleenItemProperty" ADD CONSTRAINT "UitleenItemProperty_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UitleenItemDownload" ADD CONSTRAINT "UitleenItemDownload_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "UitleenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
