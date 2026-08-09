/**
 * Minimale mail-helper op basis van nodemailer + SMTP uit de omgeving.
 *
 * Is `SMTP_HOST` niet gezet, dan wordt de mail gelogd i.p.v. verstuurd. Zo werkt
 * lokale ontwikkeling zonder mailserver, terwijl in productie een echte SMTP-config
 * (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM`)
 * volstaat. nodemailer wordt lui geladen zodat de module ook laadt zonder de dep
 * of zonder SMTP-config.
 *
 * Enkel server-side gebruiken (server actions, instrumentation).
 */

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Afzender. Leeg = de standaard uit `MAIL_FROM`. Zet dit wanneer een mail uit
   * een andere hoek van de kring komt dan de standaardafzender: het
   * contactformulier hoort niet als "Theokot VTK" in de inbox te landen.
   */
  from?: string;
  /**
   * Antwoordadres. Zonder dit gaat "Beantwoorden" naar de afzender hierboven, en
   * dat is bij een doorgestuurd bericht (contactformulier) net de verkeerde kant
   * op: dan komt het antwoord bij onszelf terecht.
   */
  replyTo?: string;
  messageId?: string;
};

const FROM = process.env.MAIL_FROM || 'Theokot VTK <theokot@vtk.be>';

/**
 * Verstuurt een mail, of logt ze wanneer SMTP niet geconfigureerd is.
 *
 * Geeft terug of de mail de deur uit is. Bestaande aanroepers mogen dat negeren
 * (een mislukte no-show-waarschuwing mag de verwerking niet doen falen), maar
 * een formulier dat de gebruiker "verstuurd" meldt, moet het verschil weten.
 *
 * `throwOnError` is het zwaardere alternatief: dan gooit een mislukking door naar
 * de aanroeper. Gebruik het waar de mail zelf de opdracht is en stil falen dus
 * niet mag, zoals bij de no-show-waarschuwing hieronder.
 */
export async function sendMail(
  input: MailInput,
  options: { throwOnError?: boolean } = {},
): Promise<boolean> {
  const from = input.from?.trim() || FROM;
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(
      `[mail] SMTP niet geconfigureerd; mail niet verstuurd.\n  from: ${from}\n  to: ${input.to}${input.replyTo ? `\n  reply-to: ${input.replyTo}` : ''}\n  subject: ${input.subject}\n  ${input.text.replace(/\n/g, '\n  ')}`,
    );
    // Lokaal is loggen de bedoeling; dat mag niet als mislukking tellen.
    return true;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      messageId: input.messageId,
    });
    return true;
  } catch (err) {
    console.error('[mail] versturen mislukt:', err);
    if (options.throwOnError) throw err;
    return false;
  }
}

type NoShowMailUser = { name: string; email: string; locale: 'NL' | 'EN' };

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
