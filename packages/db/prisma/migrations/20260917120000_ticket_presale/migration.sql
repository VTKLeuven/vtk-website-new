-- Voorverkoop per ticketevent: een duur voor de verkoopstart, en wie er in mag.
ALTER TABLE "TicketEvent" ADD COLUMN "presaleLeadMinutes" INTEGER;
ALTER TABLE "TicketEvent" ADD COLUMN "presalePraesidium" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "TicketEventPresaleGroup" (
    "eventId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "TicketEventPresaleGroup_pkey" PRIMARY KEY ("eventId","groupId")
);

CREATE INDEX "TicketEventPresaleGroup_groupId_idx" ON "TicketEventPresaleGroup"("groupId");

ALTER TABLE "TicketEventPresaleGroup" ADD CONSTRAINT "TicketEventPresaleGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketEventPresaleGroup" ADD CONSTRAINT "TicketEventPresaleGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
