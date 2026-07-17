-- Machineleesbare koppeling tussen een POC en de richtingen die hij bedient.
-- `Poc.studyTrack` blijft de vrije tekst voor op de POC-pagina; dit veld laat de
-- homepage de POC's van jouw `User.studyProgrammes` tonen. Meerdere richtingen
-- per POC kan, vandaar een array. Bestaande rijen starten leeg: een beheerder
-- duidt de richtingen aan via /admin/pocs (de seed vult de standaard-POC's in).
ALTER TABLE "Poc" ADD COLUMN "studyProgrammes" "StudyProgramme"[] DEFAULT ARRAY[]::"StudyProgramme"[];
