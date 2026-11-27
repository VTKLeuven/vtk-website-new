-- De vakken onder "Waaraan werk je?" in de app, zelf te beheren.
-- Bestaande profielen krijgen een lege lijst en `subjectsSetAt` NULL, en dat is
-- "nooit zelf bewaard": de app toont dan de vakken van de laatste sessies,
-- precies wat ze vandaag ziet.
ALTER TABLE "StudyProfile" ADD COLUMN "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "StudyProfile" ADD COLUMN "subjectsSetAt" TIMESTAMPTZ(3);
