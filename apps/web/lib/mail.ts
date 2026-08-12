/**
 * Theokot-specifieke mails.
 *
 * De transportlaag zelf (SMTP, EHLO, STARTTLS) staat sinds augustus 2026 in
 * `@vtk/mail`, omdat `apps/logistiek` ze ook nodig heeft. Importeer `sendMail`,
 * `smtpConfigured` en `smtpEhloName` daar rechtstreeks; dit bestand houdt enkel
 * de berichten over die over broodjes gaan.
 */
import { sendMail } from '@vtk/mail';

type MailUser = { name: string; email: string; locale: 'NL' | 'EN' };

/**
 * Bericht dat een gereserveerd broodje voor een grocomeet of bureau niet meer
 * kan: het aanbod van die verkoopdag is gewijzigd of Theokot is dicht. Vertelt
 * meteen waar er opnieuw gekozen kan worden, want een melding zonder uitweg
 * laat iemand met lege handen achter.
 */
export async function sendMeetingReservationInvalidated(
  user: MailUser,
  meeting: { meetingLabel: string; dateLabel: string; reason: string; path: string },
): Promise<void> {
  const nl = user.locale !== 'EN';
  const base = (
    process.env.TICKETING_PUBLIC_URL?.trim() ||
    process.env.VTK_MAIN_URL?.trim() ||
    'https://vtk.be'
  ).replace(/\/$/, '');
  const url = `${base}${meeting.path}`;
  const subject = nl
    ? `${meeting.meetingLabel}: je broodje van ${meeting.dateLabel} kan niet meer`
    : `${meeting.meetingLabel}: your sandwich for ${meeting.dateLabel} is no longer available`;
  const text = nl
    ? `Dag ${user.name},\n\nJe reserveerde een broodje voor de ${meeting.meetingLabel} van ${meeting.dateLabel}, maar dat kan niet meer: ${meeting.reason}\n\nKies een ander broodje (of enkel een drankje) op ${url}\n\nGroeten,\nVTK`
    : `Hi ${user.name},\n\nYou reserved a sandwich for the ${meeting.meetingLabel} of ${meeting.dateLabel}, but it is no longer possible: ${meeting.reason}\n\nPick another sandwich (or just a drink) at ${url}\n\nRegards,\nVTK`;
  await sendMail({ to: user.email, subject, text }, { throwOnError: true });
}

type NoShowMailUser = MailUser;

/** Waarschuwingsmail wanneer iemand zijn broodje(s) niet is komen ophalen. */
export async function sendNoShowWarning(
  user: NoShowMailUser,
  sessionDateLabel: string,
  orderId: string,
): Promise<void> {
  const nl = user.locale !== 'EN';
  const subject = nl
    ? 'Theokot: je bestelling werd niet opgehaald'
    : 'Theokot: your order was not picked up';
  const text = nl
    ? `Dag ${user.name},\n\nJe hebt broodjes gereserveerd bij Theokot voor ${sessionDateLabel}, maar deze werden niet opgehaald.\n\nGereserveerde broodjes die niet worden afgehaald, gaan verloren. Herhaaldelijk niet komen opdagen kan leiden tot een tijdelijke schorsing van het reservatiesysteem.\n\nGroeten,\nTheokot VTK`
    : `Hi ${user.name},\n\nYou reserved sandwiches at Theokot for ${sessionDateLabel}, but they were not picked up.\n\nReserved sandwiches that are not collected go to waste. Repeatedly not showing up can lead to a temporary suspension from the reservation system.\n\nRegards,\nTheokot VTK`;
  await sendMail(
    { to: user.email, subject, text, messageId: `<theokot-no-show-${orderId}@vtk.be>` },
    { throwOnError: true },
  );
}
