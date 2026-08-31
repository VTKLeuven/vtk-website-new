import 'server-only';

import { prisma } from '@vtk/db';
import { sendMail } from '@vtk/mail';
import {
  formatDateOnly,
  formatDateTime,
  parseNotifyEmails,
  requesterLabel,
  type NotifyKind,
} from './uitleen';
import { getLogistiekSettings } from './uitleen-server';
import type { LogistiekLocale } from './i18n-shared';
import { logistiekBaseUrl } from './payments';

/**
 * Mails naar de aanvrager wanneer Logistiek iets aan zijn aanvraag doet.
 *
 * Waarom dit bestaat: het beheer kan sinds fase 3 en 5 beslissingen terugdraaien,
 * uren verschuiven en de inhoud van een aanvraag aanpassen. Zonder mail merkt de
 * aanvrager dat pas wanneer hij toevallig opnieuw inlogt, en dat is meestal bij
 * het afhalen. Te laat dus.
 *
 * Drie regels die hier bewust ingebakken zitten:
 *
 * 1. **Versturen mag de actie nooit doen falen.** Een mailserver die er even niet
 *    is, mag geen goedkeuring terugdraaien. Elke functie hier vangt dus zelf en
 *    logt; de aanroeper krijgt geen fout.
 * 2. **Roep ze aan ná de transactie**, niet erin. Anders vertrekt er een mail
 *    over een wijziging die door een rollback nooit gebeurd is.
 * 3. **Niet elke statusstap mailt.** Goedgekeurd, afgewezen, gewijzigd en
 *    teruggedraaid; niet "afgehaald" of "betaald". Wie voor elke klik een mail
 *    krijgt, leest ze geen van alle nog.
 */

export type UitleenMailEvent = 'APPROVED' | 'REJECTED' | 'EDITED' | 'REOPENED';

type Recipient = { to: string; cc: string[] | undefined; name: string; locale: LogistiekLocale };

/**
 * Naar welk adres. Dezelfde regel als de hoofdsite (`preferredEmail`): wie een
 * persoonlijk adres als voorkeur zette, leest zijn universiteitsmail niet.
 */
function recipientOf(
  user: { name: string; email: string; personalEmail: string | null; emailPreference: string; locale: string },
  notifyEmail: string | null
): Recipient {
  const to =
    user.emailPreference === 'PERSONAL' && user.personalEmail ? user.personalEmail : user.email;
  // Het veld kan meerdere adressen dragen, gescheiden door een komma.
  const cc = (parseNotifyEmails(notifyEmail ?? '') ?? []).filter(
    // Een cc naar hetzelfde adres levert de aanvrager twee keer dezelfde mail.
    (address) => address.toLowerCase() !== to.toLowerCase()
  );
  return {
    to,
    cc: cc.length > 0 ? cc : undefined,
    name: user.name,
    locale: user.locale === 'EN' ? 'en' : 'nl',
  };
}

const SUBJECT_PREFIX = 'VTK Logistiek';

/** Waar de mail over gaat; bepaalt of we "je aanvraag" of "je rit" schrijven. */
type MailSubject = 'reservation' | 'trip';

function eventWords(event: UitleenMailEvent, subject: MailSubject, locale: LogistiekLocale) {
  const nl = locale !== 'en';
  const thing = nl
    ? subject === 'trip'
      ? 'je rit'
      : 'je aanvraag'
    : subject === 'trip'
      ? 'your trip'
      : 'your request';
  const Thing = thing.charAt(0).toUpperCase() + thing.slice(1);
  switch (event) {
    case 'APPROVED':
      return nl
        ? { subject: 'goedgekeurd', lead: `${Thing} is goedgekeurd.` }
        : { subject: 'approved', lead: `${Thing} has been approved.` };
    case 'REJECTED':
      return nl
        ? { subject: 'afgewezen', lead: `${Thing} is afgewezen.` }
        : { subject: 'rejected', lead: `${Thing} has been rejected.` };
    case 'EDITED':
      return nl
        ? { subject: 'aangepast', lead: `Logistiek heeft ${thing} aangepast.` }
        : { subject: 'changed', lead: `Logistics changed ${thing}.` };
    case 'REOPENED':
      return nl
        ? {
            subject: 'terug open',
            lead: `Logistiek heeft de beslissing over ${thing} teruggedraaid; ze staat weer open.`,
          }
        : {
            subject: 'reopened',
            lead: `Logistics undid the decision on ${thing}; it is open again.`,
          };
  }
}

/** Ondertekening plus de link naar het overzicht van het lid zelf. */
function footer(subject: MailSubject, locale: LogistiekLocale): string {
  const nl = locale !== 'en';
  const url = `${logistiekBaseUrl()}${subject === 'trip' ? '/ritten' : '/reservaties'}`;
  if (nl) {
    const what = subject === 'trip' ? 'Je rit bekijken' : 'Je aanvraag bekijken';
    return `${what}: ${url}\n\nGroeten,\nLogistiek VTK`;
  }
  const what = subject === 'trip' ? 'View your trip' : 'View your request';
  return `${what}: ${url}\n\nRegards,\nLogistics VTK`;
}

/**
 * Blokken aan elkaar met een lege regel ertussen. Een blok dat er niet is, valt
 * weg zonder een dubbele witregel achter te laten; daarom `null` en niet `''`
 * als "geen blok" (een lege string is hier een bewuste lege regel).
 */
function joinBlocks(blocks: Array<string | null>): string {
  return blocks.filter((block): block is string => block !== null).join('\n\n');
}

/**
 * De toelichting van het team, indien er een is. Bij een wijziging is dit de
 * historiekregel uit A6 ("Tafel: 5 → 3", "Uren verschoven naar 14:30"): zeggen
 * wát er veranderd is, niet enkel dát er iets veranderd is. Bij een afwijzing is
 * het de reden, en bij de rest een gewone zin die geen kopje nodig heeft.
 */
function detailBlock(
  note: string | null | undefined,
  event: UitleenMailEvent,
  locale: LogistiekLocale
): string | null {
  const text = note?.trim();
  if (!text) return null;
  const nl = locale !== 'en';
  if (event === 'EDITED') return `${nl ? 'Wat er veranderde:' : 'What changed:'}\n${text}`;
  if (event === 'REJECTED') return `${nl ? 'Reden:' : 'Reason:'} ${text}`;
  return text;
}

async function deliver(recipient: Recipient, subject: string, text: string): Promise<void> {
  try {
    await sendMail({
      to: recipient.to,
      cc: recipient.cc,
      subject,
      text,
      from: process.env.LOGISTIEK_MAIL_FROM || 'Logistiek VTK <logistiek@vtk.be>',
    });
  } catch (err) {
    // sendMail vangt zelf al; dit is de vangnetlaag voor alles ervoor.
    console.error('[uitleen-mail] versturen mislukt:', err);
  }
}

/**
 * Mail over een materiaal- of flesserke-aanvraag.
 *
 * `note` is de toelichting die ook in de historiek staat. Faalt het ophalen of
 * versturen, dan blijft het bij een logregel.
 */
export async function notifyReservation(
  reservationId: string,
  event: UitleenMailEvent,
  note?: string | null
): Promise<void> {
  try {
    const reservation = await prisma.uitleenReservation.findUnique({
      where: { id: reservationId },
      select: {
        eventName: true,
        pickupDate: true,
        returnDate: true,
        adminNote: true,
        notifyEmail: true,
        user: {
          select: {
            name: true,
            email: true,
            personalEmail: true,
            emailPreference: true,
            locale: true,
          },
        },
        lines: {
          select: {
            itemName: true,
            quantity: true,
            note: true,
            adminNote: true,
            lineStatus: true,
          },
        },
        flesserkeLines: { select: { itemName: true, quantity: true } },
      },
    });
    if (!reservation) return;

    const recipient = recipientOf(reservation.user, reservation.notifyEmail);
    const nl = recipient.locale !== 'en';
    const words = eventWords(event, 'reservation', recipient.locale);

    // De opmerkingen per item horen in de mail (E6): de aanvrager leest die mail
    // en niet het scherm, en "zie vorig event" of "graag de zwarte" is precies
    // de afspraak die daarna misloopt als ze er niet in staat.
    const lineText = (line: {
      itemName: string;
      quantity: number;
      note?: string | null;
      adminNote?: string | null;
    }) => {
      const notes = [line.note, line.adminNote].filter(Boolean).join(' | ');
      return `- ${line.quantity} x ${line.itemName}${notes ? ` (${notes})` : ''}`;
    };

    const granted = reservation.lines.filter((line) => line.lineStatus !== 'REJECTED');
    const refused = reservation.lines.filter((line) => line.lineStatus === 'REJECTED');
    const items = [...granted.map(lineText), ...reservation.flesserkeLines.map(lineText)].join('\n');
    // Niet toegekende items staan apart onderaan, niet tussen de rest: tussen de
    // goedgekeurde lijst gelezen worden ze meegenomen naar het evenement (E6).
    const refusedBlock =
      refused.length > 0
        ? `\n\n${nl ? 'Niet toegekend:' : 'Not granted:'}\n${refused
            .map(
              (line) =>
                `- ${line.quantity} x ${line.itemName}${line.adminNote ? ` (${line.adminNote})` : ''}`
            )
            .join('\n')}`
        : '';
    const period = `${formatDateOnly(reservation.pickupDate, recipient.locale)} - ${formatDateOnly(
      reservation.returnDate,
      recipient.locale
    )}`;

    // Bij een afwijzing is de nota van het team de reden; die hoort in de mail,
    // anders is "afgewezen" alles wat de aanvrager weet.
    const reason = event === 'REJECTED' ? note ?? reservation.adminNote : note;

    const text = joinBlocks([
      nl ? `Dag ${recipient.name},` : `Hi ${recipient.name},`,
      words.lead,
      `${nl ? 'Aanvraag' : 'Request'}: ${reservation.eventName}\n${nl ? 'Periode' : 'Period'}: ${period}`,
      items ? `${nl ? 'Materiaal' : 'Items'}:\n${items}${refusedBlock}` : refusedBlock.trim() || null,
      detailBlock(reason, event, recipient.locale),
      footer('reservation', recipient.locale),
    ]);

    await deliver(
      recipient,
      `${SUBJECT_PREFIX}: ${reservation.eventName} ${words.subject}`,
      text
    );
  } catch (err) {
    console.error('[uitleen-mail] reservatiemail mislukt:', err);
  }
}

/**
 * Mail over een rit. Neemt een lijst id's omdat een heen- en terugrit samen
 * beslist worden (V12): dat is één mail met beide ritten, geen twee mails vlak
 * na elkaar over dezelfde aanvraag.
 */
export async function notifyTransport(
  bookingIds: string[],
  event: UitleenMailEvent,
  note?: string | null
): Promise<void> {
  try {
    if (bookingIds.length === 0) return;
    const bookings = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: bookingIds } },
      orderBy: { startAt: 'asc' },
      select: {
        purpose: true,
        startAt: true,
        endAt: true,
        tripLeg: true,
        adminNote: true,
        notifyEmail: true,
        vehicle: { select: { nameNl: true, nameEn: true } },
        user: {
          select: {
            name: true,
            email: true,
            personalEmail: true,
            emailPreference: true,
            locale: true,
          },
        },
      },
    });
    if (bookings.length === 0) return;

    const first = bookings[0];
    const recipient = recipientOf(first.user, first.notifyEmail);
    const nl = recipient.locale !== 'en';
    const words = eventWords(event, 'trip', recipient.locale);

    const legLabel = (leg: string | null) => {
      if (leg === 'HEEN') return nl ? 'Heenrit' : 'Outbound';
      if (leg === 'TERUG') return nl ? 'Terugrit' : 'Return';
      return nl ? 'Rit' : 'Trip';
    };
    const trips = bookings
      .map(
        (booking) =>
          `- ${legLabel(booking.tripLeg)}: ${formatDateTime(booking.startAt, recipient.locale)} - ${formatDateTime(
            booking.endAt,
            recipient.locale
          )} (${nl ? booking.vehicle.nameNl : booking.vehicle.nameEn})`
      )
      .join('\n');

    const reason = event === 'REJECTED' ? note ?? first.adminNote : note;

    const text = joinBlocks([
      nl ? `Dag ${recipient.name},` : `Hi ${recipient.name},`,
      words.lead,
      `${nl ? 'Rit' : 'Trip'}: ${first.purpose}`,
      trips,
      detailBlock(reason, event, recipient.locale),
      footer('trip', recipient.locale),
    ]);

    await deliver(recipient, `${SUBJECT_PREFIX}: ${first.purpose} ${words.subject}`, text);
  } catch (err) {
    console.error('[uitleen-mail] ritmail mislukt:', err);
  }
}

/**
 * Melding naar het team zodra er een nieuwe aanvraag binnenkomt (M1).
 *
 * De andere mails in dit bestand gaan naar de **aanvrager** en enkel bij een
 * beslissing. Deze gaat de andere kant op, en is de reden dat het team tot nu toe
 * elke dag zelf ging kijken of er iets binnengekomen was.
 *
 * Dezelfde drie regels als hierboven gelden onverkort:
 *
 * 1. **Aanroepen ná de write**, nooit erin.
 * 2. **Falen mag de aanvraag niet doen falen.** Een lid dat "er ging iets mis"
 *    te zien krijgt omdat de mailserver plat ligt, dient opnieuw in, en dan staan
 *    er twee.
 * 3. **Enkel bij het indienen.** Elke wijziging melden zou dezelfde mailbox
 *    vullen tot niemand ze nog leest.
 *
 * Naar welk adres staat per soort op /beheer/instellingen. Is dat leeg, dan
 * vertrekt er niets; dat scherm zegt dat er dan niets vertrekt.
 */
export async function notifyTeamNewRequest(kind: NotifyKind, id: string): Promise<void> {
  try {
    const settings = await getLogistiekSettings();
    const to = settings.notifyEmails[kind] ?? [];
    if (to.length === 0) return;

    const body = kind === 'transport' ? await transportSummary(id) : await reservationSummary(id);
    if (!body) return;

    // Allemaal in één bericht met de rest in kopie: drie losse mails naar
    // dezelfde mailbox lezen als drie aanvragen.
    await deliver(
      { to: to[0], cc: to.slice(1), name: '', locale: 'nl' },
      `${SUBJECT_PREFIX}: nieuwe ${kind}aanvraag, ${body.title}`,
      body.text
    );
  } catch (err) {
    console.error('[uitleen-mail] teammelding mislukt:', err);
  }
}

/** De samenvatting van een materiaal- of flesserke-aanvraag voor de teammelding. */
async function reservationSummary(id: string): Promise<{ title: string; text: string } | null> {
  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id },
    select: {
      eventName: true,
      pickupDate: true,
      returnDate: true,
      memberNote: true,
      delivery: true,
      requesterType: true,
      requesterName: true,
      user: { select: { name: true } },
      group: { select: { nameNl: true } },
      lines: { select: { itemName: true, quantity: true } },
      flesserkeLines: { select: { itemName: true, quantity: true } },
    },
  });
  if (!reservation) return null;

  const items = [...reservation.lines, ...reservation.flesserkeLines]
    .map((line) => `- ${line.quantity} x ${line.itemName}`)
    .join('\n');

  return {
    title: reservation.eventName,
    text: joinBlocks([
      `Er is een nieuwe aanvraag binnengekomen op ${logistiekBaseUrl()}.`,
      `Aanvraag: ${reservation.eventName}\nVan: ${requesterLabel(reservation)} (${reservation.user.name})\nPeriode: ${formatDateOnly(reservation.pickupDate)} - ${formatDateOnly(reservation.returnDate)}`,
      items ? `Gevraagd:\n${items}` : null,
      reservation.delivery ? 'Er is levering gevraagd.' : null,
      reservation.memberNote ? `Nota van het lid:\n${reservation.memberNote}` : null,
      `Beslissen: ${logistiekBaseUrl()}/beheer/aanvragen/${id}`,
    ]),
  };
}

/** Idem voor een rit; bij een heen-en-terugaanvraag staan beide ritten erin. */
async function transportSummary(id: string): Promise<{ title: string; text: string } | null> {
  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id },
    select: {
      purpose: true,
      cargoNote: true,
      eventName: true,
      startAt: true,
      endAt: true,
      tripGroupId: true,
      pickupAddress: true,
      destination: true,
      memberNote: true,
      requesterType: true,
      requesterName: true,
      user: { select: { name: true } },
      group: { select: { nameNl: true } },
      vehicle: { select: { nameNl: true } },
      helpers: { orderBy: { createdAt: 'asc' }, select: { name: true, phone: true } },
    },
  });
  if (!booking) return null;

  // Heen en terug zijn twee boekingen maar één aanvraag; het team beslist er in
  // één keer over, dus staan ze in één mail.
  const legs = booking.tripGroupId
    ? await prisma.uitleenTransportBooking.findMany({
        where: { tripGroupId: booking.tripGroupId },
        orderBy: { startAt: 'asc' },
        select: { startAt: true, endAt: true, vehicle: { select: { nameNl: true } } },
      })
    : [{ startAt: booking.startAt, endAt: booking.endAt, vehicle: booking.vehicle }];

  return {
    title: booking.eventName?.trim() || booking.purpose,
    text: joinBlocks([
      `Er is een nieuwe ritaanvraag binnengekomen op ${logistiekBaseUrl()}.`,
      `Waarvoor: ${booking.purpose}\nVan: ${requesterLabel(booking)} (${booking.user.name})`,
      legs
        .map(
          (leg) =>
            `- ${formatDateTime(leg.startAt)} tot ${formatDateTime(leg.endAt)} (${leg.vehicle.nameNl})`
        )
        .join('\n'),
      booking.cargoNote ? `Lading: ${booking.cargoNote}` : null,
      booking.helpers.length > 0
        ? `Bijrijders: ${booking.helpers
            .map((helper) => `${helper.name}${helper.phone ? ` (${helper.phone})` : ''}`)
            .join(', ')}`
        : null,
      [booking.pickupAddress, booking.destination].some(Boolean)
        ? `Van: ${booking.pickupAddress ?? 'niet ingevuld'}\nNaar: ${booking.destination ?? 'niet ingevuld'}`
        : null,
      booking.memberNote ? `Nota van het lid:\n${booking.memberNote}` : null,
      `Beslissen: ${logistiekBaseUrl()}/beheer/vervoer?rit=${id}`,
    ]),
  };
}
