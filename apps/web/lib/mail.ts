/**
 * Theokot-specifieke mails.
 *
 * De transportlaag zelf (SMTP, EHLO, STARTTLS) staat sinds augustus 2026 in
 * `@vtk/mail`, omdat `apps/logistiek` ze ook nodig heeft. De website gaat via
 * `@/lib/email`, dat boven op die transportlaag het centrale logboek vult; dit
 * bestand houdt enkel de berichten over die over broodjes gaan.
 */
import { sendMail } from '@/lib/email';
import {
  mailButton,
  mailContentRow,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
  mailInfoTable,
  mailNoticeBox,
  mailParagraph,
} from '@/lib/mailDesign';

type MailUser = { name: string; email: string; locale: 'NL' | 'EN' };

/** Onderwerp en tekst, los van het versturen, zodat /admin/it/flows exact
 *  dezelfde mail kan tonen als de ontvanger krijgt. */
export type TheokotMail = { subject: string; text: string; html: string };

/**
 * Bericht dat een gereserveerd broodje voor een grocomeet of bureau niet meer
 * kan: het aanbod van die verkoopdag is gewijzigd of Theokot is dicht. Vertelt
 * meteen waar er opnieuw gekozen kan worden, want een melding zonder uitweg
 * laat iemand met lege handen achter.
 */
export function meetingReservationInvalidatedMail(
  user: Pick<MailUser, 'name' | 'locale'>,
  meeting: { meetingLabel: string; dateLabel: string; reason: string; url: string },
): TheokotMail {
  const nl = user.locale !== 'EN';
  const subject = nl
    ? `${meeting.meetingLabel}: je broodje van ${meeting.dateLabel} kan niet meer`
    : `${meeting.meetingLabel}: your sandwich for ${meeting.dateLabel} is no longer available`;

  const text = nl
    ? `Dag ${user.name},\n\nJe reserveerde een broodje voor de ${meeting.meetingLabel} van ${meeting.dateLabel}, maar dat kan niet meer: ${meeting.reason}\n\nKies een ander broodje (of enkel een drankje) op ${meeting.url}\n\nGroeten,\nVTK`
    : `Hi ${user.name},\n\nYou reserved a sandwich for the ${meeting.meetingLabel} of ${meeting.dateLabel}, but it is no longer possible: ${meeting.reason}\n\nPick another sandwich (or just a drink) at ${meeting.url}\n\nRegards,\nVTK`;

  const info = mailInfoTable([
    { label: nl ? 'Vergadering' : 'Meeting', value: meeting.meetingLabel },
    { label: nl ? 'Datum' : 'Date', value: meeting.dateLabel },
    { label: nl ? 'Reden' : 'Reason', value: meeting.reason },
  ]);

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'Theokot' })}${mailContentRow(
      `${mailHeading(nl ? 'Broodje niet beschikbaar' : 'Sandwich not available')}${mailParagraph(
        nl ? `Dag ${user.name},` : `Hi ${user.name},`,
      )}${mailParagraph(
        nl
          ? `Je reserveerde een broodje voor de ${meeting.meetingLabel} van ${meeting.dateLabel}, maar dat kan helaas niet meer doorgaan:`
          : `You reserved a sandwich for the ${meeting.meetingLabel} of ${meeting.dateLabel}, but it is no longer available:`,
      )}${info}${mailParagraph(
        nl
          ? 'Kies gerust een ander broodje (of enkel een drankje) via de knop hieronder:'
          : 'Feel free to pick another sandwich (or just a drink) via the button below:',
      )}<div style="margin:22px 0">${mailButton(
        meeting.url,
        nl ? 'Kies een ander broodje' : 'Pick another sandwich',
      )}</div>`,
    )}${mailFooterRow('Theokot VTK · vtk.be/theokot')}`,
  });

  return { subject, text, html };
}

export async function sendMeetingReservationInvalidated(
  user: MailUser,
  meeting: { meetingLabel: string; dateLabel: string; reason: string; path: string },
): Promise<void> {
  const base = (
    process.env.TICKETING_PUBLIC_URL?.trim() ||
    process.env.VTK_MAIN_URL?.trim() ||
    'https://vtk.be'
  ).replace(/\/$/, '');
  const mail = meetingReservationInvalidatedMail(user, {
    ...meeting,
    url: `${base}${meeting.path}`,
  });
  await sendMail({ to: user.email, ...mail }, { throwOnError: true, source: 'theokot' });
}

type NoShowMailUser = MailUser;

/** Waarschuwingsmail wanneer iemand zijn broodje(s) niet is komen ophalen. */
export function noShowWarningMail(
  user: Pick<NoShowMailUser, 'name' | 'locale'>,
  sessionDateLabel: string,
): TheokotMail {
  const nl = user.locale !== 'EN';
  const subject = nl
    ? 'Theokot: je bestelling werd niet opgehaald'
    : 'Theokot: your order was not picked up';

  const text = nl
    ? `Dag ${user.name},\n\nJe hebt broodjes gereserveerd bij Theokot voor ${sessionDateLabel}, maar deze werden niet opgehaald.\n\nGereserveerde broodjes die niet worden afgehaald, gaan verloren. Herhaaldelijk niet komen opdagen kan leiden tot een tijdelijke schorsing van het reservatiesysteem.\n\nGroeten,\nTheokot VTK`
    : `Hi ${user.name},\n\nYou reserved sandwiches at Theokot for ${sessionDateLabel}, but they were not picked up.\n\nReserved sandwiches that are not collected go to waste. Repeatedly not showing up can lead to a temporary suspension from the reservation system.\n\nRegards,\nTheokot VTK`;

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'Theokot' })}${mailContentRow(
      `${mailHeading(nl ? 'Bestelling niet opgehaald' : 'Order not picked up')}${mailParagraph(
        nl ? `Dag ${user.name},` : `Hi ${user.name},`,
      )}${mailParagraph(
        nl
          ? `Je hebt broodjes gereserveerd bij Theokot voor ${sessionDateLabel}, maar deze werden helaas niet opgehaald.`
          : `You reserved sandwiches at Theokot for ${sessionDateLabel}, but they were not picked up.`,
      )}${mailNoticeBox(
        nl
          ? 'Gereserveerde broodjes die niet worden afgehaald, gaan verloren. Herhaaldelijk niet komen opdagen kan leiden tot een tijdelijke schorsing van het reservatiesysteem.'
          : 'Reserved sandwiches that are not collected go to waste. Repeatedly not showing up can lead to a temporary suspension from the reservation system.',
        nl ? 'Belangrijk' : 'Important',
      )}${mailParagraph(
        nl
          ? 'Heb je vragen over je reservatie of liep er iets mis? Laat het gerust weten aan het Theokot-team.'
          : 'If you have questions about your reservation or if something went wrong, please reach out to the Theokot team.',
        { muted: true },
      )}`,
    )}${mailFooterRow('Theokot VTK · vtk.be/theokot')}`,
  });

  return { subject, text, html };
}

export async function sendNoShowWarning(
  user: NoShowMailUser,
  sessionDateLabel: string,
  orderId: string,
): Promise<void> {
  await sendMail(
    {
      to: user.email,
      ...noShowWarningMail(user, sessionDateLabel),
      messageId: `<theokot-no-show-${orderId}@vtk.be>`,
    },
    { throwOnError: true, source: 'theokot' },
  );
}

/**
 * Bericht dat een gereserveerde bestelling geschrapt is.
 *
 * Twee aanleidingen, één mail: de verkoopdag is verwijderd, of het aanbod van
 * die dag is verlaagd onder wat er al gereserveerd was. In beide gevallen is er
 * iets weggenomen dat iemand al had, dus de mail zegt wat er weg is, waarom, en
 * waar hij opnieuw kan kijken. Zonder die mail staat iemand voor een lege balie.
 */
export function orderCancelledMail(
  user: Pick<MailUser, 'name' | 'locale'>,
  order: { dateLabel: string; reason: string; itemsLabel: string; url: string },
): TheokotMail {
  const nl = user.locale !== 'EN';
  const subject = nl
    ? `Theokot: je bestelling van ${order.dateLabel} is geannuleerd`
    : `Theokot: your order for ${order.dateLabel} has been cancelled`;

  const text = nl
    ? `Dag ${user.name},\n\nJe bestelling bij Theokot voor ${order.dateLabel} is geannuleerd: ${order.reason}\n\nHet gaat om: ${order.itemsLabel}\n\nJe hoeft niets te betalen. Kijk op ${order.url} of er nog een andere dag openstaat.\n\nGroeten,\nTheokot VTK`
    : `Hi ${user.name},\n\nYour Theokot order for ${order.dateLabel} has been cancelled: ${order.reason}\n\nThis concerns: ${order.itemsLabel}\n\nYou do not owe anything. Check ${order.url} to see whether another day is open.\n\nRegards,\nTheokot VTK`;

  const info = mailInfoTable([
    { label: nl ? 'Verkoopdag' : 'Sale day', value: order.dateLabel },
    { label: nl ? 'Geannuleerd' : 'Cancelled', value: order.itemsLabel },
    { label: nl ? 'Reden' : 'Reason', value: order.reason },
  ]);

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'Theokot' })}${mailContentRow(
      `${mailHeading(nl ? 'Bestelling geannuleerd' : 'Order cancelled')}${mailParagraph(
        nl ? `Dag ${user.name},` : `Hi ${user.name},`,
      )}${mailParagraph(
        nl
          ? `Je bestelling bij Theokot voor ${order.dateLabel} kan niet doorgaan:`
          : `Your Theokot order for ${order.dateLabel} cannot go ahead:`,
      )}${info}${mailParagraph(
        nl
          ? 'Je hoeft niets te betalen. Staat er nog een andere verkoopdag open, dan kan je daar gewoon opnieuw reserveren:'
          : 'You do not owe anything. If another sale day is open, you can simply reserve again:',
      )}<div style="margin:22px 0">${mailButton(
        order.url,
        nl ? 'Naar de broodjes' : 'To the sandwiches',
      )}</div>`,
    )}${mailFooterRow('Theokot VTK · vtk.be/theokot')}`,
  });

  return { subject, text, html };
}

export async function sendOrderCancelled(
  user: MailUser,
  order: { dateLabel: string; reason: string; itemsLabel: string },
): Promise<void> {
  const base = (
    process.env.TICKETING_PUBLIC_URL?.trim() ||
    process.env.VTK_MAIN_URL?.trim() ||
    'https://vtk.be'
  ).replace(/\/$/, '');
  await sendMail(
    { to: user.email, ...orderCancelledMail(user, { ...order, url: `${base}/theokot` }) },
    // Bewust niet `throwOnError`: de bestelling is al geschrapt wanneer deze mail
    // vertrekt, en één adres dat het begeeft hoort de rest van de ronde niet
    // tegen te houden. De mislukking staat met haar fout in `EmailLog`.
    { source: 'theokot' },
  );
}
