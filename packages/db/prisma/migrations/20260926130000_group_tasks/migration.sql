-- Wie doet wat: de vaste taken van een post en wie ze per werkingsjaar opneemt
-- (/admin/wie-doet-wat, zie docs/design-decisions.md).
--
-- Twee nieuwe tabellen, dus geen bestaande rij verandert. Een taak hoort bij de
-- post en overleeft 15 juli; een toewijzing hangt aan een `GroupMembership` en is
-- daarmee vanzelf per werkingsjaar.

CREATE TYPE "GroupTaskRole" AS ENUM ('HOLDER', 'BACKUP');

CREATE TABLE "GroupTask" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "forGroupId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GroupTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupTask_groupId_idx" ON "GroupTask"("groupId");
CREATE INDEX "GroupTask_forGroupId_idx" ON "GroupTask"("forGroupId");

ALTER TABLE "GroupTask" ADD CONSTRAINT "GroupTask_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupTask" ADD CONSTRAINT "GroupTask_forGroupId_fkey"
    FOREIGN KEY ("forGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GroupTaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" "GroupTaskRole" NOT NULL DEFAULT 'HOLDER',
    CONSTRAINT "GroupTaskAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupTaskAssignment_taskId_membershipId_key" ON "GroupTaskAssignment"("taskId", "membershipId");
CREATE INDEX "GroupTaskAssignment_membershipId_idx" ON "GroupTaskAssignment"("membershipId");

ALTER TABLE "GroupTaskAssignment" ADD CONSTRAINT "GroupTaskAssignment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "GroupTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupTaskAssignment" ADD CONSTRAINT "GroupTaskAssignment_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
