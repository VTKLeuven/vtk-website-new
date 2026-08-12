/**
 * Rooktest voor de uitleendienst-mail: vertrekt er echt iets, en van wie?
 *
 *   npm run mail:test -w @vtk/logistiek -- iemand@vtk.be
 *
 * Waarom dit bestaat en niet "keur gewoon een aanvraag goed": een echte
 * goedkeuring stuurt een mail naar een echte aanvrager over een aanvraag die
 * daardoor van status verandert. Voor de vraag "staat de SMTP-config juist?" is
 * dat te veel bijwerking. Dit script raakt de database niet aan en stuurt naar
 * één adres dat je zelf meegeeft.
 *
 * Het gebruikt dezelfde `sendMail` en dezelfde `LOGISTIEK_MAIL_FROM` als de
 * echte mails, dus wat hier aankomt, is wat een aanvrager ziet: de afzender, de
 * naam ervoor, en of het in de inbox of in de spam belandt.
 *
 * Het print eerst wat het gaat doen. Let vooral op de eerste regel: is SMTP niet
 * geconfigureerd, dan meldt `sendMail` succes terwijl het bericht enkel in de
 * log staat. Dat is de valkuil waar dit script tegen beschermt.
 */
import { sendMail, smtpConfigured, smtpEhloName } from '@vtk/mail';

const to = process.argv[2]?.trim();

async function main() {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('Geef één e-mailadres mee:\n  npm run mail:test -w @vtk/logistiek -- iemand@vtk.be');
    process.exitCode = 1;
    return;
  }

  const from = process.env.LOGISTIEK_MAIL_FROM || 'Logistiek VTK <logistiek@vtk.be>';
  const host = process.env.SMTP_HOST?.trim() || '(leeg)';
  const user = process.env.SMTP_USER?.trim();

  console.log(`SMTP-host:  ${host}:${process.env.SMTP_PORT || '587'}`);
  console.log(`EHLO-naam:  ${smtpEhloName()}`);
  console.log(`Login:      ${user ? `als ${user}` : 'geen (relay op IP-adres)'}`);
  console.log(`Afzender:   ${from}`);
  console.log(`Naar:       ${to}`);
  console.log(`Basis-URL:  ${process.env.LOGISTIEK_PUBLIC_URL || '(leeg, valt terug op localhost)'}`);
  console.log('');

  if (!smtpConfigured()) {
    console.error(
      'SMTP_HOST is leeg. Het bericht hieronder wordt gelogd en NIET verstuurd;\n' +
        'dat is lokaal de bedoeling, maar op de server betekent het dat de app\n' +
        'de root-.env niet leest. Controleer `env_file` van de logistiek-service.\n'
    );
  }

  const stamp = new Date().toISOString();
  const sent = await sendMail({
    to,
    from,
    subject: 'Testbericht van de uitleendienst',
    text: [
      'Dag,',
      '',
      'Dit is een testbericht van de uitleendienst van VTK. Komt het aan, dan staan',
      'de SMTP-instellingen juist en vertrekken ook de mails over een goedgekeurde,',
      'gewijzigde of afgewezen aanvraag.',
      '',
      `Verstuurd op ${stamp} vanaf ${smtpEhloName()}.`,
      '',
      'Groeten,',
      'Logistiek VTK',
    ].join('\n'),
  });

  // `sendMail` geeft ook `true` terug wanneer er niets geconfigureerd is, dus de
  // uitkomst is enkel betekenisvol samen met de controle hierboven.
  if (!sent) {
    console.error('\nVersturen mislukt. De fout van de mailserver staat hierboven.');
    // De twee fouten die je in de praktijk krijgt, met hun echte oorzaak erbij;
    // allebei lezen ze anders dan ze zijn.
    if (/^(127\.0\.0\.1|localhost|::1)$/.test(host.split(':')[0])) {
      console.error(
        'Wijst SMTP_HOST naar een lokale mailcatcher, dan is "STARTTLS: 502 Command\n' +
          'not implemented" normaal: die spreekt geen TLS, en wij eisen dat op 587\n' +
          'wél. Laat SMTP_HOST lokaal gewoon leeg; dan zie je de mail in de log.'
      );
    }
    console.error(
      '"421 4.7.0 Try again later (EHLO)" van Google is geen storing bij hen: dan\n' +
        'stelt de app zich voor met een naam die de relay weigert. Zet SMTP_EHLO_NAME.'
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    smtpConfigured()
      ? 'De mailserver heeft het bericht aanvaard. Kijk in de inbox, en in de spam.'
      : 'Enkel gelogd (zie hierboven waarom).'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
