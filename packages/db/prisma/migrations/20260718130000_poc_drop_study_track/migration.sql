-- 'Studierichting' (de vrije tekst `studyTrack`) verdwijnt: de aangevinkte
-- richtingen (`studyProgrammes`) zijn voortaan de enige koppeling met een
-- studierichting. De publieke POC-pagina en de homepage tonen geen aparte
-- track-ondertitel meer, dus de kolom is nergens nog nodig.
ALTER TABLE "Poc" DROP COLUMN "studyTrack";
