-- Eigen, privé items in de planning van de app (afspraken zonder vak).

CREATE TABLE "PlanningPersonalItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "start" TEXT,
    "end" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlanningPersonalItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanningPersonalItem_userId_date_idx" ON "PlanningPersonalItem"("userId", "date");

ALTER TABLE "PlanningPersonalItem" ADD CONSTRAINT "PlanningPersonalItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
