# Uitleendienst in gebruik nemen: invullen en testen

Na de feedbackronde van augustus 2026 (`docs/logistiek-feedback-plan.md`) staat de
code er. Wat hier volgt is het werk dat **niet** in code kan: gegevens die het team
zelf invult, en wat er getest moet worden vóór de kring ermee werkt.

Technische kaart: `docs/uitleendienst.md`. Productkeuzes: `docs/design-decisions.md`
(§ Uitleendienst).

## Wat er nog ingevuld moet worden

### Op de server (env)

**Het SMTP-blok dat er al staat voor de ticketmails wordt hergebruikt.** Sinds A9
loopt alle uitgaande mail van beide apps over `packages/mail`, dat dezelfde
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` en
`SMTP_EHLO_NAME` leest. Zet ze niet nog eens: in een plat `.env` wint de laatste
van twee blokken, en dan verandert er stil iets aan de ticketmails.

Toe te voegen aan de root-`.env`:

- `LOGISTIEK_MAIL_FROM="Logistiek VTK <logistiek@vtk.be>"`. Enkel de afzender
  verschilt; `MAIL_FROM` blijft van ticketing en Theokot. Het adres moet in
  Workspace bestaan (zie hieronder), anders weigert de relay het bericht.
- `LOGISTIEK_PUBLIC_URL="https://logistiek.vtk.be"`. De link onderaan elke mail
  wordt daaruit gebouwd; staat er localhost, dan staat dat in de mail.

Controleer ook `SMTP_EHLO_NAME`: leeg is goed (dan wordt het `vtk.be`), maar
`[127.0.0.1]` uit een container laat de Google-relay de verbinding verbreken met
"421 4.7.0 Try again later (EHLO)" en er vertrekt niets.

**Zonder `SMTP_HOST` worden de mails enkel gelogd**, niet verstuurd, en de app
meldt dat niet aan de gebruiker.

Drie dingen die op 11 augustus 2026 op liv nog leeg of verkeerd stonden, los van
de mail:

- **`MOLLIE_API_KEY` is leeg terwijl `LOGISTIEK_PAYMENT_PROVIDER` op `mollie`
  staat.** Zolang er niets te betalen valt, merk je dat niet; de eerste aanvraag
  met een huurprijs loopt erop vast. De sleutel is dezelfde als die van ticketing.
- **`LOGISTIEK_MAINTENANCE_SECRET` is leeg**, dus `logistiek-worker` schakelt
  zichzelf uit ("Logistiek worker disabled") en staat daarom op `unhealthy`. Die
  worker is het vangnet voor de betalingen: hij verzoent openstaande Mollie-betalingen
  en ruimt verlopen checkouts op. Genereer er een met `openssl rand -base64 48`.
- **`LOGISTIEK_TEST_LOGIN` staat op `true`.** Dat is nu ongevaarlijk, want
  `testLoginEnabled()` eist óók `NODE_ENV !== 'production'` en `/test-login` geeft
  404 op de server. Het blijft een geladen wapen in de `.env`: zet het leeg.

### In de Google Workspace-admin

**Er moet niets bij.** De regel "SMTP liv.vtk.be" onder **Apps > Google Workspace >
Gmail > Routing > SMTP relay service** dekt de uitleendienst al:

- **Toegestane afzenders: "Alleen adressen in mijn domeinen".** Dat is de ruime
  variant: elk `@vtk.be`-adres wordt aanvaard als afzender, ook eentje dat als
  account niet bestaat. `logistiek@vtk.be` hoeft dus niet aangemaakt te worden om
  te kúnnen versturen. Zie hieronder waarom je dat toch wil.
- **Alleen e-mails van de opgegeven IP-adressen (IPv4 + IPv6 van liv.vtk.be),
  SMTP-verificatie uit.** Daarom moeten `SMTP_USER` en `SMTP_PASSWORD` **leeg
  blijven**. Vul je ze in, dan probeert nodemailer te authenticeren op een relay
  die geen login aanvaardt en vertrekt er niets meer, ook de ticketmails niet.
  De IPv6-regel is geen luxe: het compose-netwerk staat op `enable_ipv6`, dus
  uitgaand verkeer kan er die kant uit gaan.
- **TLS-versleuteling vereisen: uit.** Dat is de eis van Google, niet de onze;
  `packages/mail` zet zelf `requireTLS` op poort 587 en doet dus hoe dan ook
  STARTTLS.
- SPF en DKIM van `vtk.be` gelden voor het hele domein en staan al goed.

**Maak `logistiek@vtk.be` wel aan als groep of alias**, ook al eist de relay het
niet. De mails zetten geen reply-to, dus "Beantwoorden" gaat naar de afzender; is
dat een adres dat niet bestaat, dan bounct het antwoord van een aanvrager of
verdwijnt het. Bestaat het adres niet en wil je er geen, zet dan een adres in
`LOGISTIEK_MAIL_FROM` dat wél gelezen wordt.

Het meelezende adres van de werkgroep (`logistiek.existenz@vtk.be` en dergelijke)
komt in **kopie**, niet in de afzender. Dat is een veld dat de aanvrager zelf
invult en het heeft geen relay-rechten nodig.

### `/beheer/instellingen`

- Last-minute-termijn (staat op 7 dagen; beslissing B5).
- Huurprijzen tonen ja/nee.
- Per voertuig: naam NL/EN, tariefmodus en tarief, en het vinkje "vraagt een
  chauffeur die met de kar mag rijden".

### `/beheer/chauffeurs`

- Wie chauffeur is, en per chauffeur of die met de kar mag rijden. Zonder dat
  laatste kan het goedkeuringsscherm van een karrit geen onderscheid maken.

### `/beheer/materiaal`

- **Schap en rek per item.** De klaarzetlijst en het printblad tonen "-" zolang
  dat leeg is, en dat is net waarvoor ze bedoeld zijn.
- **Volume in liter**, minstens voor het grote spul (tafels, frigo's, boxen).
  Anders zegt het evenementscherm enkel "van 40 stuks is het volume niet
  ingevuld".
- De set-inhoud per set, de alternatieven per item, en de foto's.
- **Exemplaren** aanmaken voor de items waar één stuk kapot kan zijn terwijl de
  rest werkt (frigo's, boxen). Voor de rest hoeft er niets te gebeuren.
- De gasflessen als gewone catalogusitems invoeren (beslissing B4).
- De algemene inventariscontrole op ontbrekende items en foute aantallen.

### `/beheer/flesserke`

- **De hoeveelheid per item** ("0,5 L", "1,5 l"). Het importscript nam de
  Excel-kolom over met kale getallen; dat was het halve gat van F1 en kan pas
  ingevuld worden sinds flesserke-items bewerkbaar zijn.
- **De ladingen splitsen** waar er echt meerdere vervaldata liggen. De migratie
  maakte één lading per item van de toenmalige voorraad: dat klopt in totaal, maar
  niet per vervaldatum.
- De Colruyt-links.

### `/beheer/teksten`

De publieke lead- en betaalteksten van de materiaal- en vervoerpagina's.

### Sjablonen

Maak de terugkerende aanvragen aan (cantus, BBQ, receptie) vanaf een bestaande
aanvraag, met "Bewaar als sjabloon" op de detailpagina.

### Evenementen: de historiek groeperen

```
npm run group:events -w @vtk/logistiek            # dry-run, schrijft niets
npm run group:events -w @vtk/logistiek -- --apply  # pas na nakijken
```

Laat het team de voorgestelde clusters nakijken vóór `--apply`. Een verkeerde
groepering hangt aanvragen van twee posten onder één naam, en dat is vervelender
dan geen groepering.

## Wat er getest moet worden

Op volgorde van risico. Bij elk punt staat wat er tijdens de bouw al nagekeken is,
zodat je weet waar de blinde vlekken zitten.

1. **De mails (A9).** Het enige stuk dat nooit echt vertrokken is: lokaal ging het
   naar de log of botste het op een mailcatcher zonder STARTTLS.

   Begin met de rooktest; die raakt de database niet aan en stuurt naar één adres
   dat je zelf kiest:

   ```
   npm run mail:test -w @vtk/logistiek -- jouw.adres@vtk.be
   ```

   Op de server draai je hem in de container, zodat hij dezelfde omgeving ziet als
   de app. Daar niet via `npm run`: de npm-scripts zetten er `dotenv -e ../../.env`
   voor, en dat bestand zit niet in de container.

   ```
   docker compose -f infra/docker-compose.yml exec -w /app/apps/logistiek \
     logistiek npx tsx scripts/test-mail.ts jouw.adres@vtk.be
   ```

   Hij print eerst de host, de EHLO-naam, de afzender en of er ingelogd wordt; komt
   daar "SMTP_HOST is leeg" uit, dan leest de container de root-`.env` niet en heeft
   verder testen geen zin.

   *Op 11 augustus 2026 op liv gedraaid: de relay aanvaardde het bericht, met
   `smtp-relay.gmail.com:587`, EHLO `vtk.be`, zonder login en als
   `Logistiek VTK <logistiek@vtk.be>`. De transportlaag staat dus goed; wat nog
   niet nagekeken is, zijn de vier échte mails vanuit een goedkeuring.*

   Test daarom nog goedkeuren, afwijzen, wijzigen en terugdraaien; kijk of het
   meelezende adres in kopie meekomt en of de link onderaan klopt. *Nagekeken: de
   inhoud van alle vier de mails in de dev-log, en dat een mislukte verzending de
   actie niet doet falen.*
2. **Flesserke-voorraad (F3).** Terugbrengen, ongedaan maken, en kijken of het
   totaal blijft kloppen. *Nagekeken: FIFO over twee ladingen en het terugdraaien,
   maar met verzonnen data.*
3. **Het printblad (A7).** Print één aanvraag én een volle dag: marges,
   pagina-einden, en of de site-navigatie echt wegvalt. *Nagekeken: dat de
   print-CSS geladen wordt en elke selector precies één element raakt; niet hoe het
   uit een printer komt.*
4. **Conflicten en schuiven (M2).** Twee aanvragen voor hetzelfde item in dezelfde
   periode: goedkeuren moet geblokkeerd blijven, schuiven moet beide aanvragers
   een mail opleveren. *Nagekeken: de blokkering, de "past dit?"-knop en het
   schuiven zelf. Het mailstuk hangt aan punt 1.*
5. **Staat per exemplaar (M1).** Splits één item op, zet er een op kapot, en kijk
   of de beschikbaarheid met precies één zakt. *Nagekeken met Bakfrigo: 3 → 2.*
6. **Meerdere voertuigen en heen-en-terug (V1, V12).** Vraag de kar én de auto
   samen aan; ze moeten samen goedgekeurd, afgewezen en geannuleerd worden.
   *Nagekeken: aanvragen en samen goedkeuren.*
7. **Het concept (M18).** Vul een aanvraag half in, sluit de tab, kom terug. Test
   ook op je gsm: het concept zit per browser, dus het volgt je niet naar een
   ander toestel.
8. **Het evenementscherm (A8).** Hang een materiaal- en een vervoeraanvraag onder
   hetzelfde evenement en kijk of de waarschuwing over het ontbrekende deel klopt.
9. **De publieke bezettingspagina (V13).** Stuur de link naar iemand zonder
   VTK-account en controleer dat er geen namen, adressen of doelen op staan.
10. **Alles op een gsm.** Tijdens de bouw is enkel op desktopbreedte gekeken; de
    beheerschermen zijn dicht.
11. **Met een echte login.** De tests liepen op de test-personas
    (`LOGISTIEK_TEST_LOGIN`). Kijk of een gewoon praesidiumlid, een werkgrooplid en
    iemand zonder groep elk zien wat ze horen te zien, zeker bij flesserke.

**Volgorde:** punt 1 blokkeert een deel van punt 4. Zet de SMTP-config dus eerst.
