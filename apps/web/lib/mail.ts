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
};

const FROM = process.env.MAIL_FROM || 'Theokot VTK <theokot@vtk.be>';

/** Verstuurt een mail, of logt ze wanneer SMTP niet geconfigureerd is. */
export async function sendMail(input: MailInput): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(
      `[mail] SMTP niet geconfigureerd — mail niet verstuurd.\n  to: ${input.to}\n  subject: ${input.subject}\n  ${input.text.replace(/\n/g, '\n  ')}`,
    );
    return;
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
      from: FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (err) {
    // Mail-fouten mogen de aanroeper (bvb no-show-verwerking) niet doen falen.
    console.error('[mail] versturen mislukt:', err);
  }
}

type NoShowMailUser = { name: string; email: string; locale: 'NL' | 'EN' };

/** Waarschuwingsmail wanneer iemand zijn broodje(s) niet is komen ophalen. */
export async function sendNoShowWarning(
  user: NoShowMailUser,
  sessionDateLabel: string,
): Promise<void> {
  const nl = user.locale !== 'EN';
  const subject = nl
    ? 'Theokot: je bestelling werd niet opgehaald'
    : 'Theokot: your order was not picked up';
  const text = nl
    ? `Dag ${user.name},\n\nJe hebt broodjes gereserveerd bij Theokot voor ${sessionDateLabel}, maar deze werden niet opgehaald.\n\nGereserveerde broodjes die niet worden afgehaald, gaan verloren. Herhaaldelijk niet komen opdagen kan leiden tot een tijdelijke schorsing van het reservatiesysteem.\n\nGroeten,\nTheokot VTK`
    : `Hi ${user.name},\n\nYou reserved sandwiches at Theokot for ${sessionDateLabel}, but they were not picked up.\n\nReserved sandwiches that are not collected go to waste. Repeatedly not showing up can lead to a temporary suspension from the reservation system.\n\nRegards,\nTheokot VTK`;
  await sendMail({ to: user.email, subject, text });
}
