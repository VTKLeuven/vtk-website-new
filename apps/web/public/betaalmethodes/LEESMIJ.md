# Logo's van de betaalmethodes

`PaymentMethodChooser` toont hier het logo van de betaalwijze en valt terug op
een pictogram zolang het bestand er niet staat. De server kijkt bij het opstarten
of `<provider>.svg` of `<provider>.png` bestaat
(`lib/ticketing/paymentMethods.ts`), dus na het toevoegen van een bestand moet de
server even herstarten.

## Wat er nu staat

| Bestand | Herkomst | Kwaliteit |
| --- | --- | --- |
| `bancontact.png` | `bancontact.com/img/bancontact-logo.png`, de site van het merk zelf | Goed: 936x168, transparant, het huidige logo |
| `mollie.png` | Het bedrijfsavatar van Mollie op Crunchbase | **Zwakke plek**: 1000x1000 wit-op-zwart vierkant, geen woordmerk met transparantie |

## Vervang `mollie.png` zodra je het echte merkpakket hebt

Dat vierkant is Crunchbase' profieltegel, geen merkbestand: het draagt zijn eigen
zwarte vlak mee, dus het staat als een zwarte sticker naast de tekst en het
schaalt niet mee met de knop. Mollie levert zelf vectorbestanden van het logo en
van de betaalmethode-iconen via `mollie.com/resources` (zie hun supportartikel
"Where can I find the official Mollie logo"). Zet die SVG hier als `mollie.svg`
neer; de server geeft SVG voorrang op PNG en het vierkant verdwijnt vanzelf.

## Teken een logo nooit zelf na

Het zijn handelsmerken: vorm, kleur en de vrije ruimte errond liggen vast in de
merkrichtlijnen, en een nagetekende versie is zowel juridisch als visueel fout.
Neem ze uit het officiële merkpakket dat bij je contract hoort.

## Hoe ze getoond worden

Een tegel van 88x34 met `object-fit: contain`, zodat een breed woordmerk en een
vierkant icoon dezelfde kolombreedte houden. Enkel op de donkere voorkeursknop
krijgt het logo een witte ondergrond; daar zou een donkerblauw woordmerk anders
wegvallen.
