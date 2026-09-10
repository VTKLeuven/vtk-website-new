-- Wie het evenement organiseert, wanneer dat niet de beherende groep is.
--
-- `groupId` blijft bepalen wie het evenement mag bewerken, en dat is altijd een
-- echte VTK-groep. Bij een crossover met een andere kring, of bij een activiteit
-- die een partner in onze kalender koopt, is die groep niet de organisator; hem
-- toch zo tonen is onjuist tegenover de bezoeker en tegenover de partner.
--
-- Optioneel en zonder standaard: leeg betekent "de groep organiseert", en elk
-- bestaand evenement blijft dus tonen wat het vandaag toont.

ALTER TABLE "CalendarEvent" ADD COLUMN "organiserName" TEXT;
