-- Mollie telt voortaan in de maand van de betaling, zoals Payconiq, SumUp en
-- Europabank (Beheer, review van 18 november 2026). Tot nu telde een
-- Mollie-regel in de maand van haar uitbetaling (de referentie
-- 12345678.2610.01 is oktober), en een betaling die nog niet uitbetaald was,
-- telde nergens (NULL). Het verschil met wat Mollie overschreef, rekent de site
-- nu zelf uit als de wijziging van de dynamische reserve.
--
-- Wat er met bestaande rijen gebeurt: elke Mollie-regel krijgt de maand van
-- haar eigen tijdstip op de Brusselse klok. Kosten en reserve uit het
-- balansrapport stonden al zo en veranderen niet. Een regel waarvan de oude of
-- de nieuwe maand in een afgesloten periode valt, blijft zoals hij is:
-- afgesloten is afgesloten. Heropen zo'n periode eerst en voer deze UPDATE dan
-- opnieuw uit; hij is idempotent. Op productie was op 22 november 2026 geen
-- enkele periode afgesloten.
UPDATE "IncomeTransaction" t
SET "periodMonth" = date_trunc('month', t."occurredAt" AT TIME ZONE 'Europe/Brussels')::date
WHERE t."source" = 'MOLLIE'
  AND t."periodMonth" IS DISTINCT FROM date_trunc('month', t."occurredAt" AT TIME ZONE 'Europe/Brussels')::date
  AND NOT EXISTS (
    SELECT 1
    FROM "IncomePeriod" p
    WHERE (t."periodMonth" IS NOT NULL AND t."periodMonth" BETWEEN p."fromMonth" AND p."toMonth")
       OR (date_trunc('month', t."occurredAt" AT TIME ZONE 'Europe/Brussels')::date BETWEEN p."fromMonth" AND p."toMonth")
  );
