-- De weekmail van de kalender (zaterdagavond, aan de lijst Evenementen). Nieuwe
-- tabel: bij het uitrollen heeft niemand al een weekmail gekregen, dus de eerste
-- zaterdag na de deploy krijgt iedereen op de lijst er een.
CREATE TABLE "CalendarWeekMail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarWeekMail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarWeekMail_userId_week_key" ON "CalendarWeekMail"("userId", "week");
CREATE INDEX "CalendarWeekMail_week_idx" ON "CalendarWeekMail"("week");

ALTER TABLE "CalendarWeekMail" ADD CONSTRAINT "CalendarWeekMail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
