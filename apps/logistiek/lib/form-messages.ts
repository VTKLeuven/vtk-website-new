import type { LogistiekLocale } from './i18n-shared';

/**
 * De foutmeldingen van het aanvraagformulier (materiaal, flesserke en
 * transport), in beide talen (N3).
 *
 * `buildReservationData` en `buildTransportBookings` valideren de aanvraag op de
 * server; hun melding komt in de rode foutzone van het formulier. Die stond
 * enkel in het Nederlands, ook voor wie de site in het Engels zette. Het beheer
 * roept dezelfde functies aan en blijft Nederlands (de standaard).
 */
export const FORM_MESSAGES = {
  nl: {
    tripLegOutbound: ' van de heenrit',
    tripLegReturn: ' van de terugrit',
    chooseStartEnd: (leg: string) => `Kies een start- en eindmoment${leg}.`,
    startInPast: (leg: string) => `Het startmoment${leg} ligt in het verleden.`,
    endBeforeStart: (leg: string) => `Het eindmoment${leg} ligt voor het startmoment.`,
    quarterHour: (leg: string) => `Kies een begin- en einduur op het kwartier (bv. 14:00, 14:15)${leg}.`,
    tripTooLong: (days: number, leg: string) =>
      `Een rit kan maximaal ${days} dagen duren; controleer de datums${leg}.`,
    returnBeforeOutbound: 'De terugrit start voor de heenrit gedaan is.',
    describePurpose: 'Beschrijf waarvoor je het voertuig nodig hebt.',
    chooseVehicle: 'Kies een voertuig.',
    nameActivity: 'Geef je activiteit een naam.',
    chooseRequester: 'Kies namens wie je aanvraagt.',
    choosePost: 'Kies de post waarvoor je aanvraagt.',
    notYourPost: 'Je kan enkel aanvragen voor een post waar je lid van bent.',
    chooseDates: 'Kies een afhaal- en terugbrengdatum.',
    pickupInPast: 'De afhaaldatum ligt in het verleden.',
    returnBeforePickup: 'De terugbrengdatum ligt voor de afhaaldatum.',
    reservationTooLong: (days: number) =>
      `Een reservatie kan maximaal ${days} dagen duren; mail logistiek@vtk.be voor langere periodes.`,
    attendancePositive: 'De verwachte opkomst moet een positief getal zijn.',
    eventStartInvalid: 'Het startmoment van het evenement is ongeldig.',
    itemTwice: 'Elk item mag maar één keer in de aanvraag staan.',
    itemGone: 'Een van de gekozen items bestaat niet meer; herlaad de catalogus.',
    itemAvailable: (name: string, quantity: number) => `Van "${name}" zijn er maar ${quantity} beschikbaar.`,
    flesserkeInternal: 'Flesserke is enkel voor interne werking beschikbaar.',
    flesserkeTwice: 'Elk flesserke-item mag maar één keer in de aanvraag staan.',
    flesserkeGone: 'Een van de flesserke-items bestaat niet meer; herlaad de lijst.',
    flesserkeStock: (name: string, quantity: number) => `Van "${name}" zijn er maar ${quantity} in stock.`,
    chooseOneItem: 'Kies minstens één item.',
  },
  en: {
    tripLegOutbound: ' of the outbound trip',
    tripLegReturn: ' of the return trip',
    chooseStartEnd: (leg: string) => `Choose a start and end time${leg}.`,
    startInPast: (leg: string) => `The start time${leg} is in the past.`,
    endBeforeStart: (leg: string) => `The end time${leg} is before the start time.`,
    quarterHour: (leg: string) => `Choose start and end times on the quarter hour (e.g. 14:00, 14:15)${leg}.`,
    tripTooLong: (days: number, leg: string) => `A trip can last at most ${days} days; check the dates${leg}.`,
    returnBeforeOutbound: 'The return trip starts before the outbound trip ends.',
    describePurpose: 'Describe what you need the vehicle for.',
    chooseVehicle: 'Choose a vehicle.',
    nameActivity: 'Give your activity a name.',
    chooseRequester: 'Choose who you are requesting for.',
    choosePost: 'Choose the post you are requesting for.',
    notYourPost: 'You can only request for a post you are a member of.',
    chooseDates: 'Choose a pickup and return date.',
    pickupInPast: 'The pickup date is in the past.',
    returnBeforePickup: 'The return date is before the pickup date.',
    reservationTooLong: (days: number) =>
      `A reservation can last at most ${days} days; mail logistiek@vtk.be for longer periods.`,
    attendancePositive: 'The expected attendance must be a positive number.',
    eventStartInvalid: 'The start time of the event is not valid.',
    itemTwice: 'Each item can only appear once in the request.',
    itemGone: 'One of the chosen items no longer exists; reload the catalogue.',
    itemAvailable: (name: string, quantity: number) => `Only ${quantity} of "${name}" are available.`,
    flesserkeInternal: 'Flesserke is only available for internal use.',
    flesserkeTwice: 'Each flesserke item can only appear once in the request.',
    flesserkeGone: 'One of the flesserke items no longer exists; reload the list.',
    flesserkeStock: (name: string, quantity: number) => `Only ${quantity} of "${name}" are in stock.`,
    chooseOneItem: 'Choose at least one item.',
  },
} satisfies Record<LogistiekLocale, Record<string, unknown>>;

export type FormMessages = (typeof FORM_MESSAGES)['nl'];
