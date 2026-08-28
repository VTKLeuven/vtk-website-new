-- Een gebundelde terugkoppeling is één mail over meerdere lesbezoeken. `lesbezoekId`
-- blijft de eerste van de reeks; de rest staat hier, zodat het versturen bij elk
-- bezoek `requesterNotifiedAt` kan zetten.
ALTER TABLE "LesbezoekScheduledMail" ADD COLUMN "bundledIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
