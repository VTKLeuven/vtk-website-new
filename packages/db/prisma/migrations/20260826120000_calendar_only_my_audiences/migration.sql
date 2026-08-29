-- Doelgroepevents zijn standaard voor iedereen zichtbaar.
--
-- Tot nu verborg de site een doelgroepevent voor wie er niet bij hoorde: op de
-- homepage, in de zoekresultaten en in de app zag een tweedejaars geen enkele
-- alumni-activiteit. Dat is de omgekeerde wereld voor een kring die net wil dat
-- mensen ontdekken wat er allemaal is; de doelgroep is een label, geen slot.
--
-- Het filter blijft bestaan als persoonlijke voorkeur (/account). Wie het
-- aanzet, krijgt weer enkel de algemene evenementen plus zijn eigen doelgroepen.
ALTER TABLE "User" ADD COLUMN "calendarOnlyMyAudiences" BOOLEAN NOT NULL DEFAULT false;
