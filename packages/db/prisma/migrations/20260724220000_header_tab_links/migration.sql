-- Extra menu-items per headertab (externe bestemmingen zoals career.vtk.be en
-- cudi.vtk.be), naast de pagina's die onder de tab hangen.
CREATE TABLE "HeaderTabLink" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HeaderTabLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HeaderTabLink_tabId_url_key" ON "HeaderTabLink"("tabId", "url");
CREATE INDEX "HeaderTabLink_tabId_idx" ON "HeaderTabLink"("tabId");

ALTER TABLE "HeaderTabLink" ADD CONSTRAINT "HeaderTabLink_tabId_fkey"
    FOREIGN KEY ("tabId") REFERENCES "HeaderTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
