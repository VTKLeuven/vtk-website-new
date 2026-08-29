-- Wanneer een account zichzelf met e-mail en wachtwoord aanmaakte. Enkel bij
-- zo'n account houdt een onbevestigd e-mailadres de login tegen; accounts van
-- een beheerder of via KU Leuven SSO blijven ongemoeid.
ALTER TABLE "User" ADD COLUMN "selfRegisteredAt" TIMESTAMPTZ(3);
