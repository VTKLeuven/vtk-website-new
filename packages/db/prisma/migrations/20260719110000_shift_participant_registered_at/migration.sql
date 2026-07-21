-- Uitschrijven blijft geblokkeerd binnen 24u voor de start, maar wie zich net
-- vergist heeft moet dat kunnen rechtzetten. Daarvoor is het moment van
-- inschrijven nodig; bestaande rijen krijgen "nu", zodat niemand met
-- terugwerkende kracht een bedenktijd krijgt die al verstreken is.
ALTER TABLE "ShiftParticipant" ADD COLUMN "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
