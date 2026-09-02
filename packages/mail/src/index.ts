/**
 * Minimale mail-helper op basis van nodemailer + SMTP uit de omgeving.
 *
 * Woonde tot augustus 2026 in `apps/web/lib/mail.ts`. Sinds `apps/logistiek`
 * ook mails stuurt (een gewijzigde aanvraag moet de aanvrager bereiken zonder
 * dat die inlogt) staat hij hier, zodat beide apps dezelfde transport-instelling
 * en dezelfde hard geleerde lessen gebruiken.
 *
 * Is `SMTP_HOST` niet gezet, dan wordt de mail gelogd i.p.v. verstuurd. Zo werkt
 * lokale ontwikkeling zonder mailserver, terwijl in productie een echte SMTP-config
 * (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`,
 * `MAIL_FROM`) volstaat. nodemailer wordt lui geladen zodat de module ook laadt
 * zonder de dep of zonder SMTP-config.
 *
 * Let op wie hierop bouwt: zonder SMTP geeft deze functie `true` terug. Dat is
 * juist voor een formulier dat lokaal getest wordt, maar wie een verzending
 * eenmalig afvinkt (zoals de shift-herinneringen) moet zelf eerst nagaan of er
 * een mailserver is; zie `smtpConfigured()`.
 *
 * Enkel server-side gebruiken (server actions, instrumentation).
 */

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Adressen in kopie. De uitleendienst zet hier het meelezende adres van de
   * werkgroep in ("logistiek.existenz@vtk.be"), zodat de mailbox van de post
   * dezelfde melding krijgt als de aanvrager persoonlijk.
   */
  cc?: string | string[];
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
  /**
   * Bijlagen. Bewust enkel een buffer met een naam en een type: een pad of een
   * URL meegeven zou nodemailer laten lezen van schijf of van het net, en de
   * enige aanroeper (het rekeningenblad) heeft de bytes al in de hand.
   */
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
};

/**
 * Technisch resultaat van de SMTP-poging. De gewone {@link sendMail} houdt haar
 * oude boolean-contract; de website gebruikt dit rijkere resultaat om het
 * e-maillogboek te vullen zonder de transportlogica te dupliceren.
 */
export type MailDeliveryResult =
  | {
      status: 'sent' | 'partial';
      messageId: string | null;
      response: string | null;
      accepted: string[];
      rejected: string[];
    }
  | { status: 'simulated'; messageId: string | null }
  | { status: 'failed'; error: unknown };

const FROM = process.env.MAIL_FROM || 'Theokot VTK <theokot@vtk.be>';

/**
 * De afzender die een mail zonder eigen `from` krijgt.
 *
 * Bestaat omdat de beheerschermen een voorbeeld van de uitgaande mail tonen: die
 * moet dezelfde afzender noemen als wat er echt in de inbox verschijnt, en dat
 * kan het scherm niet raden.
 */
export function defaultMailFrom(): string {
  return FROM;
}

/**
 * Is er een mailserver? Voor het onderscheid tussen "verstuurd" en "gelogd omdat
 * er niets ingesteld is". Wie een verzending maar één keer probeert, moet dit
 * eerst vragen; anders vinkt hij in productie iets af dat nooit vertrokken is.
 */
export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

/**
 * De naam waarmee we ons bij de mailserver voorstellen (het EHLO-commando).
 *
 * Zonder dit vult nodemailer zelf iets in, en in een container werd dat
 * `[127.0.0.1]`. De relay van Google antwoordt daarop met
 * "421 4.7.0 Try again later, closing connection. (EHLO)" en verbreekt de
 * verbinding: geen enkele mail vertrekt, terwijl dezelfde container met
 * `EHLO vtk.be` gewoon 250 krijgt. Het kostte een avond omdat de fout eruitziet
 * als een tijdelijke storing bij Google ("try again later") en de outbox dus
 * braaf blijft herproberen.
 *
 * Een echte hostnaam dus, met `SMTP_EHLO_NAME` te overschrijven wanneer een
 * andere mailserver een specifieke naam wil zien.
 */
export function smtpEhloName(): string {
  return process.env.SMTP_EHLO_NAME?.trim() || 'vtk.be';
}

/**
 * Verstuurt een mail, of logt ze wanneer SMTP niet geconfigureerd is.
 *
 * Geeft het technische resultaat terug voor aanroepers die message-id,
 * aanvaarde/geweigerde adressen of de fout nodig hebben. De compatibele
 * boolean-helper staat onderaan.
 */
export async function deliverMail(input: MailInput): Promise<MailDeliveryResult> {
  const from = input.from?.trim() || FROM;
  const cc = Array.isArray(input.cc) ? input.cc.filter(Boolean) : input.cc;
  const ccLabel = Array.isArray(cc) ? cc.join(', ') : cc;
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(
      `[mail] SMTP niet geconfigureerd; mail niet verstuurd.\n  from: ${from}\n  to: ${input.to}${ccLabel ? `\n  cc: ${ccLabel}` : ''}${input.replyTo ? `\n  reply-to: ${input.replyTo}` : ''}\n  subject: ${input.subject}${input.attachments?.length ? `\n  bijlagen: ${input.attachments.map((a) => a.filename).join(', ')}` : ''}\n  ${input.text.replace(/\n/g, '\n  ')}`,
    );
    // Lokaal is loggen de bedoeling; dat mag niet als mislukking tellen.
    return { status: 'simulated', messageId: input.messageId ?? null };
  }

  try {
    const nodemailer = await import('nodemailer');
    const secure = process.env.SMTP_SECURE === 'true';
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure,
      name: smtpEhloName(),
      // Zonder dit valt nodemailer terug op een onversleutelde verbinding
      // wanneer de server STARTTLS niet aankondigt. Op poort 587 is dat nooit de
      // bedoeling: dan gaan een wachtwoord en de inhoud van de mail in het klare
      // over de lijn. De relay van Google weigert zo'n verbinding sowieso.
      requireTLS: !secure,
      // Een mailserver die niet antwoordt mag de worker niet vasthouden; anders
      // blijft de herinneringsronde hangen tot de volgende interval erover valt.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            // Twee namen voor hetzelfde wachtwoord. De ticketmailer
            // (`apps/web/lib/ticketing/mail.ts`) leest `SMTP_PASSWORD`, deze las
            // van oudsher `SMTP_PASS`, en `.env.example` declareerde allebei in
            // twee aparte blokken. In een plat `.env` won de laatste, dus wie er
            // één invulde kreeg stil een helft van de mails die niet
            // authenticeerde. Nu volstaat `SMTP_PASSWORD`; `SMTP_PASS` blijft
            // werken voor omgevingen die het al gezet hebben.
            pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
          }
        : undefined,
    });
    const result = await transport.sendMail({
      from,
      to: input.to,
      cc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      messageId: input.messageId,
      attachments: input.attachments,
    });

    const accepted = addressList(result.accepted);
    const rejected = addressList(result.rejected);
    return {
      status: rejected.length > 0 ? 'partial' : 'sent',
      messageId: typeof result.messageId === 'string' ? result.messageId : null,
      response: typeof result.response === 'string' ? result.response : null,
      accepted,
      rejected,
    };
  } catch (err) {
    console.error('[mail] versturen mislukt:', err);
    return { status: 'failed', error: err };
  }
}

/** Zet de uiteenlopende nodemailer-vormen om naar waarden voor logging. */
function addressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((address) => String(address));
}

export async function sendMail(
  input: MailInput,
  options: { throwOnError?: boolean } = {},
): Promise<boolean> {
  const result = await deliverMail(input);
  if (result.status !== 'failed') return true;
  if (options.throwOnError) throw result.error;
  return false;
}
