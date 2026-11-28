import type { LogistiekLocale } from './i18n-shared';

/**
 * Engelse vertaling van wat de ledenacties (`app/actions/uitleen.ts`)
 * teruggeven: de rode foutmelding en de groene bevestiging (N3).
 *
 * Gettext-stijl: de Nederlandse zin in de action blijft de bron, en deze
 * catalogus vertaalt hem aan de rand (`localizeActionResult`, aangeroepen door
 * de geëxporteerde action). Zo hoeft geen van de honderd zinnen in de actions
 * zelf te veranderen, en blijft het beheer, dat dezelfde zinnen niet ziet, er
 * buiten.
 *
 * **Voeg je een melding toe in een ledenactie, zet ze dan ook hier.**
 * `test/action-translations.test.ts` leest de action en faalt voor elke zin
 * zonder vertaling. Ontbreekt er toch een, dan valt ze terug op het
 * Nederlands: een half vertaalde melding is beter dan geen.
 */
const EN: Record<string, string> = {
  'Geef het evenement een naam, of vink "Maak hier een nieuw evenement van" uit.':
    'Give the event a name, or untick "Make this a new event".',
  'Aanvraag ingediend. Je vindt de status bij Mijn aanvragen.':
    'Request submitted. You can follow its status under My requests.',
  'Reservatie niet gevonden.': 'Reservation not found.',
  'Deze aanvraag is al afgehaald; bewerken kan niet meer. Neem contact op met Logistiek.':
    'This request has already been picked up; it can no longer be edited. Please contact Logistics.',
  'Aanvraag bijgewerkt. Logistiek moet ze opnieuw goedkeuren.': 'Request updated. Logistics has to approve it again.',
  'Aanvraag bijgewerkt.': 'Request updated.',
  'Flesserke is enkel voor de interne werking van VTK.': 'Flesserke is only for internal VTK use.',
  'Flesserke-aanvraag ingediend. Je krijgt bericht zodra Logistiek beslist.':
    'Flesserke request submitted. You will hear back once Logistics decides.',
  'Aanvraag niet gevonden.': 'Request not found.',
  'Deze aanvraag is al beslist; bewerken kan niet meer.': 'This request has already been decided; it can no longer be edited.',
  'Flesserke-aanvraag bijgewerkt.': 'Flesserke request updated.',
  'Geef het sjabloon een naam.': 'Give the template a name.',
  'Kies eerst materiaal; een leeg sjabloon heeft geen nut.': 'Choose some equipment first; an empty template is no use.',
  'Geen van de gekozen items staat nog in de catalogus.': 'None of the chosen items is in the catalogue anymore.',
  'Dit evenement is niet van jou.': 'This event is not yours.',
  'De startdag is ongeldig.': 'The start date is not valid.',
  'De einddag is ongeldig.': 'The end date is not valid.',
  'Het einde ligt voor het begin.': 'The end is before the start.',
  'De verwachte opkomst moet een getal zijn.': 'The expected attendance must be a number.',
  'Evenement bijgewerkt.': 'Event updated.',
  'Geef aan over welk materiaal het gaat.': 'Say which equipment it is.',
  'Geef aan waar het vandaan komt.': 'Say where it comes from.',
  'Het aantal moet een getal groter dan nul zijn.': 'The quantity must be a number greater than zero.',
  'Toegevoegd aan de materiaallijst.': 'Added to the equipment list.',
  'Dit item is niet van jou.': 'This item is not yours.',
  'Van de lijst gehaald.': 'Removed from the list.',
  'Deze reservatie kan je niet meer annuleren.': 'You can no longer cancel this reservation.',
  'Deze reservatie is al betaald; mail logistiek@vtk.be om ze te annuleren.':
    'This reservation has already been paid; mail logistiek@vtk.be to cancel it.',
  'Deze reservatie kan niet meer veilig geannuleerd worden.': 'This reservation can no longer be cancelled safely.',
  'Reservatie geannuleerd.': 'Reservation cancelled.',
  'Beschrijf waarvoor je het voertuig nodig hebt.': 'Describe what you need the vehicle for.',
  'Vul een geldig begin- en einduur in.': 'Enter a valid start and end time.',
  'Het einduur ligt voor het beginuur.': 'The end time is before the start time.',
  'Kies uren op het kwartier (bv. 14:00, 14:15).': 'Choose times on the quarter hour (e.g. 14:00, 14:15).',
  'Rit niet gevonden.': 'Trip not found.',
  'Deze rit is afgerond of geannuleerd; aanpassen kan niet meer.':
    'This trip is completed or cancelled; it can no longer be changed.',
  'Rit bijgewerkt. Logistiek moet ze opnieuw goedkeuren.': 'Trip updated. Logistics has to approve it again.',
  'Rit bijgewerkt.': 'Trip updated.',
  'Deze rit kan je niet meer annuleren.': 'You can no longer cancel this trip.',
  'Deze rit is al betaald; mail logistiek@vtk.be om ze te annuleren.':
    'This trip has already been paid; mail logistiek@vtk.be to cancel it.',
  'Deze rit kan niet meer veilig geannuleerd worden.': 'This trip can no longer be cancelled safely.',
  'Niet gevonden.': 'Not found.',
  'Betalen kan pas nadat de aanvraag goedgekeurd is.': 'You can only pay once the request has been approved.',
  'Deze reservatie betaal je ter plaatse, niet online.': 'You pay for this reservation on site, not online.',
  'Al betaald.': 'Already paid.',
  'Er valt niets online te betalen.': 'There is nothing to pay online.',
  'Je betaling wordt klaargezet. Probeer over enkele seconden opnieuw.':
    'Your payment is being prepared. Try again in a few seconds.',
  'De betaalprovider is niet bereikbaar. Probeer straks opnieuw.':
    'The payment provider cannot be reached. Please try again later.',
  'Enkel karchauffeurs kunnen beschikbaarheid doorgeven.': 'Only van drivers can enter their availability.',
  'Beschikbaarheid opgeslagen.': 'Availability saved.',
  'Die soort beschikbaarheid ken ik niet.': 'That kind of availability is not known.',
  'Dit venster bestaat niet (meer).': 'This window does not exist (anymore).',
  'Venster aangepast.': 'Window changed.',
  'Dit kan niet meer ongedaan gemaakt worden.': 'This can no longer be undone.',
  'Teruggezet zoals het stond.': 'Restored as it was.',
  'Die week begrijp ik niet.': 'That week is not valid.',
  'Vorige week staat er niets in om over te nemen.': 'There is nothing in last week to copy.',
  'Kies een begin- en eindmoment.': 'Choose a start and end time.',
  'Die dag begrijp ik niet.': 'That day is not valid.',
  'Venster weggehaald.': 'Window removed.',
  'Schrijf iets in de nota.': 'Write something in the note.',
  'Kies wie deze nota mag lezen.': 'Choose who may read this note.',
  'Je kan bij deze rit geen nota schrijven.': 'You cannot write a note on this trip.',
  'Nota opgeslagen.': 'Note saved.',
  'Dit is jouw nota niet.': 'This is not your note.',
  'Nota aangepast.': 'Note changed.',
  'Nota weggehaald.': 'Note removed.',
  'Vul de naam van de bijrijder in.': 'Enter the name of the passenger.',
  'Je kan deze rit niet aanpassen.': 'You cannot change this trip.',
  'Deze rit is afgerond of geannuleerd.': 'This trip is completed or cancelled.',
  'Bijrijder toegevoegd.': 'Passenger added.',
  'Deze bijrijder staat er niet (meer).': 'This passenger is not on the trip (anymore).',
  'Bijrijder weggehaald.': 'Passenger removed.',
  'Een bijrijdshift kan zodra Logistiek de rit goedkeurt.':
    'A ride-along shift is possible once Logistics approves the trip.',
  'Deze rit is al vertrokken.': 'This trip has already left.',
  'Deze rit heeft al een bijrijdshift.': 'This trip already has a ride-along shift.',
  'Bijrijdshift staat op vtk.be/shift.': 'The ride-along shift is on vtk.be/shift.',
  'Deze bijrijdshift bestaat niet (meer).': 'This ride-along shift does not exist (anymore).',
  'De shift staat al op de uren van de rit.': 'The shift already has the hours of the trip.',
  'De shift staat weer op de uren van de rit.': 'The shift has the hours of the trip again.',
  'Deze rit is niet aan jouw post doorgegeven.': 'This trip was not handed to your post.',
  'Kies iemand van je eigen post, of iemand uit de chauffeurslijst.':
    'Choose someone from your own post, or someone from the driver list.',
  'Heen- en terugrit geannuleerd.': 'Outbound and return trip cancelled.',
  'Rit geannuleerd.': 'Trip cancelled.',
  'Chauffeur verwijderd.': 'Driver removed.',
  'Sjablonen zijn er voor de posten en werkgroepen van VTK.': 'Templates are for the posts and work groups of VTK.',
  'Deze aanvraag kon niet gelezen worden. Herlaad de pagina en probeer opnieuw.':
    'This request could not be read. Reload the page and try again.',
  '1 venster van vorige week overgenomen.': 'Copied 1 window from last week.',
  // Uit `expireOpenPayments` (lib/payments.ts), bij het annuleren.
  'Deze aanvraag is intussen betaald; mail logistiek@vtk.be om ze te annuleren.':
    'This request has been paid in the meantime; mail logistiek@vtk.be to cancel it.',
  'De openstaande betaling kon niet veilig geannuleerd worden. Probeer straks opnieuw.':
    'The open payment could not be cancelled safely. Please try again later.',
};

/** Meldingen met een gegeven erin; volgorde telt niet, ze sluiten elkaar uit. */
const EN_PATTERNS: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^(.+) vraagt een goedgekeurde karchauffeur; vraag Logistiek om er een aan te duiden\.$/, (vehicle) =>
    `${vehicle} needs an approved van driver; ask Logistics to assign one.`],
  [/^(\d+) voertuigen aangevraagd\. Je vindt de status bij Mijn aanvragen\.$/, (count) =>
    `${count} vehicles requested. You can follow the status under My requests.`],
  [/^Heen- en terugrit aangevraagd\. Je vindt de status bij Mijn aanvragen\.$/, () =>
    'Outbound and return trip requested. You can follow the status under My requests.'],
  [/^Rit aangevraagd\. Je vindt de status bij Mijn aanvragen\.$/, () =>
    'Trip requested. You can follow the status under My requests.'],
  [/^Er bestaat al een sjabloon met de naam "(.+)"\. Kies een andere naam, of gebruik het bestaande\.$/, (name) =>
    `A template named "${name}" already exists. Choose another name, or use the existing one.`],
  [/^Je hebt al (\d+) aanvragen openstaan\. Wacht tot er een afgerond is, of mail logistiek@vtk\.be\.$/, (count) =>
    `You already have ${count} open requests. Wait until one is completed, or mail logistiek@vtk.be.`],
  [/^Je hebt al (\d+) sjablonen\. Vraag Logistiek om er een op te ruimen\.$/, (count) =>
    `You already have ${count} templates. Ask Logistics to remove one.`],
  [/^Er passen er maximaal (\d+) op een rit\.$/, (count) => `At most ${count} fit on one trip.`],
  [/^Hou het bij (\d+) tekens; dit staat naast je naam in de planning\.$/, (count) =>
    `Keep it to ${count} characters; it appears next to your name in the planning.`],
  [/^Sjabloon "(.+)" bewaard\. Iedereen kan het nu kiezen\.$/, (name) =>
    `Template "${name}" saved. Everyone can choose it now.`],
  [/^(\d+) vensters van vorige week overgenomen\.$/, (count) => `Copied ${count} windows from last week.`],
  [/^(.+) rijdt deze rit\.$/, (name) => `${name} drives this trip.`],
  [/^Kies tussen (\d+) en (\d+) plaatsen\.$/, (min, max) => `Choose between ${min} and ${max} places.`],
  [/^Kies tussen (\d+) en (\d+) bonnetjes\.$/, (min, max) => `Choose between ${min} and ${max} vouchers.`],
];

/** De Engelse versie van een Nederlandse melding, of de melding zelf. */
export function translateActionText(text: string, locale: LogistiekLocale): string {
  if (locale !== 'en') return text;
  const exact = EN[text];
  if (exact) return exact;
  for (const [pattern, render] of EN_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return render(...match.slice(1));
  }
  return text;
}

/** Vertaalt `error` en `message` van een actieresultaat; de rest blijft. */
export function localizeActionResult<T>(result: T, locale: LogistiekLocale): T {
  if (locale !== 'en' || !result || typeof result !== 'object') return result;
  const record = result as Record<string, unknown>;
  const next: Record<string, unknown> = { ...record };
  if (typeof record.error === 'string') next.error = translateActionText(record.error, locale);
  if (typeof record.message === 'string') next.message = translateActionText(record.message, locale);
  return next as T;
}

/** Voor de test: welke Nederlandse zinnen er een vertaling hebben. */
export function hasTranslation(text: string): boolean {
  return translateActionText(text, 'en') !== text;
}
