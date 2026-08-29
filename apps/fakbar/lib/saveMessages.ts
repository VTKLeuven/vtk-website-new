/**
 * Foutcodes uit de server actions, vertaald naar wat er misging.
 *
 * "Opslaan is niet gelukt" zegt de gebruiker niets: die moet weten of het aan
 * het bedrag lag, aan de naam, of aan een week die al afgesloten is (CLAUDE.md).
 */
export const saveMessages: Record<string, string> = {
  NAME_REQUIRED: 'Geef het artikel een naam.',
  NAME_TAKEN: 'Er staat al een artikel met die naam op de kaart.',
  CATEGORY_REQUIRED: 'Kies een categorie.',
  PRICE_INVALID: 'De prijs moet een bedrag in euro zijn, bijvoorbeeld 2,30.',
  AMOUNT_INVALID: 'Een van de bedragen is geen geldig getal in euro.',
  COUNT_INVALID: 'Een van de aantallen is geen geheel getal van 0 of meer.',
  YEAR_INVALID: 'Dat jaartal klopt niet.',
  WEEK_INVALID: 'Dat weeknummer bestaat niet in dat jaar.',
  WEEK_EXISTS: 'Die week is al aangemaakt.',
  WEEK_MISSING: 'Die week bestaat niet meer; herlaad de pagina.',
  WEEK_CLOSED: 'Deze week is afgesloten. Heropen ze eerst in het weekoverzicht.',
  EVENING_MISSING: 'Die avond bestaat niet meer; herlaad de pagina.',
  EMAIL_INVALID: 'Dat is geen geldig e-mailadres.',
  CONDITIONS_REQUIRED: 'Vul minstens één voorwaarde in.',
  SPECIAL_KIND_REQUIRED: 'Kies bij elke special of het een drank of een actie is.',
};
