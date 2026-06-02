-- CreateEnum
CREATE TYPE "DashboardTileScope" AS ENUM ('GLOBAL', 'GROUP', 'USER');

-- CreateTable
CREATE TABLE "DashboardTile" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'link',
    "color" TEXT NOT NULL DEFAULT 'navy',
    "scope" "DashboardTileScope" NOT NULL,
    "groupId" TEXT,
    "userId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardTile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDashboardTilePref" (
    "userId" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER,
    "label" TEXT,
    "url" TEXT,
    "icon" TEXT,
    "color" TEXT,

    CONSTRAINT "UserDashboardTilePref_pkey" PRIMARY KEY ("userId","tileId")
);

-- CreateIndex
CREATE INDEX "DashboardTile_scope_idx" ON "DashboardTile"("scope");

-- CreateIndex
CREATE INDEX "DashboardTile_groupId_idx" ON "DashboardTile"("groupId");

-- CreateIndex
CREATE INDEX "DashboardTile_userId_idx" ON "DashboardTile"("userId");

-- CreateIndex
CREATE INDEX "UserDashboardTilePref_userId_idx" ON "UserDashboardTilePref"("userId");

-- AddForeignKey
ALTER TABLE "DashboardTile" ADD CONSTRAINT "DashboardTile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardTile" ADD CONSTRAINT "DashboardTile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDashboardTilePref" ADD CONSTRAINT "UserDashboardTilePref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDashboardTilePref" ADD CONSTRAINT "UserDashboardTilePref_tileId_fkey" FOREIGN KEY ("tileId") REFERENCES "DashboardTile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
