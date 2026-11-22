-- Rename maxTicketsPerOrder -> maxTicketsPerAccount (telt voortaan per account
-- over alle bestellingen heen) en voeg de aparte vinkjes voor 1 ticket per
-- bestelling (drukke ticketdrops) en verplicht inloggen toe.

ALTER TABLE "TicketEvent" RENAME COLUMN "maxTicketsPerOrder" TO "maxTicketsPerAccount";
ALTER TABLE "TicketEvent" ADD COLUMN "oneTicketPerOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketEvent" ADD COLUMN "requireLogin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TicketEventTemplate" RENAME COLUMN "maxTicketsPerOrder" TO "maxTicketsPerAccount";
ALTER TABLE "TicketEventTemplate" ADD COLUMN "oneTicketPerOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketEventTemplate" ADD COLUMN "requireLogin" BOOLEAN NOT NULL DEFAULT false;
