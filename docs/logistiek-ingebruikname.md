# Uitleendienst in gebruik nemen: invullen en testen

Na de feedbackronde van augustus 2026 (`docs/logistiek-feedback-plan.md`) staat de
code er. Wat hier volgt is het werk dat **niet** in code kan: gegevens die het team
zelf invult, en wat er getest moet worden vóór de kring ermee werkt.

Technische kaart: `docs/uitleendienst.md`. Productkeuzes: `docs/design-decisions.md`
(§ Uitleendienst).

## Wat er nog ingevuld moet worden

### Op de server (env)

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, eventueel
  `SMTP_EHLO_NAME`. **Zonder `SMTP_HOST` worden de mails enkel gelogd**, niet
  verstuurd; de app meldt dat niet aan de gebruiker.
- `LOGISTIEK_MAIL_FROM`: de afzender van de uitleendienst-mails.
- `LOGISTIEK_PUBLIC_URL` op de echte https-URL. De link onderaan elke mail wordt
  daaruit gebouwd; staat er localhost, dan staat dat in de mail.

### `/beheer/instellingen`

- Last-minute-termijn (staat op 7 dagen; beslissing B5).
- Huurprijzen tonen ja/nee.
- Per voertuig: naam NL/EN, tariefmodus en tarief, en het vinkje "vraagt een
  chauffeur die met de kar mag rijden".

### `/beheer/chauffeurs`

- Wie chauffeur is, en per chauffeur of die met de kar mag rijden. Zonder dat
  laatste kan het goedkeuringsscherm van een karrit geen onderscheid maken.

### `/beheer/materiaal`

- **Schap en rek per item.** De klaarzetlijst en het printblad tonen "—" zolang
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
   naar de log of botste het op een mailcatcher zonder STARTTLS. Test goedkeuren,
   afwijzen, wijzigen en terugdraaien; kijk of het meelezende adres in kopie
   meekomt en of de link klopt. *Nagekeken: de inhoud van alle vier de mails in de
   dev-log, en dat een mislukte verzending de actie niet doet falen.*
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
