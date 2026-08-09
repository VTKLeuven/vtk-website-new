/**
 * Inhoud van de twee pagina's onder Info die een aparte app beschrijven:
 * Uitleendienst (logistiek) en Shiften. Overgenomen van de pagina's
 * "Uitleendienst" en "Medewerkers" op de oude vtk.be.
 *
 * Waarom hier en niet enkel in de seed: de migratie
 * `20260809110000_info_pages_content` zet dezelfde tekst in databases die al
 * bestaan, want de seed draait niet bij een deploy. Die migratie is een
 * momentopname en draait maar één keer; dit bestand is de levende versie voor
 * een verse database. Wijzig je de tekst hier, dan verandert er niets meer aan
 * een database die de migratie al gezien heeft: daar is /admin/inhoud de plek.
 *
 * Bedragen, bingokaarten en voorwaarden veranderen per werkingsjaar, vandaar
 * `needsYearlyEdit` op allebei.
 */

export type InfoPageContent = {
  titleNl: string;
  titleEn: string;
  excerptNl: string;
  excerptEn: string;
  ctaLabelNl: string;
  ctaLabelEn: string;
  ctaUrl: string;
  contentMdNl: string;
  contentMdEn: string;
};

export const UITLEENDIENST_PAGE: InfoPageContent = {
  titleNl: "Uitleendienst",
  titleEn: "Equipment service",
  excerptNl: "Materiaal en vervoer lenen voor je activiteit of verhuis.",
  excerptEn: "Borrow equipment and transport for your event or move.",
  ctaLabelNl: "Reserveren",
  ctaLabelEn: "Make a reservation",
  // Admin-beheerd via /admin/inhoud; dit is enkel de startwaarde.
  ctaUrl: "https://logistiek.dev.vtk.be",
  contentMdNl: `VTK leent materiaal en vervoer uit aan haar leden en werkgroepen. Reserveren doe je online met je VTK-account. Vragen mag altijd naar <logistiek@vtk.be>.

## Materiaal

Een fuif aankleden, een fiets herstellen, een activiteit opbouwen: de kans is groot dat de uitleendienst het heeft staan.

- Standaard gereedschap: hamers, schroevendraaiers, steeksleutels, zagen
- Elektrisch gereedschap: boormachines, cirkelzaag, schuurmachine, verlengkabels
- Elektronica: werflampen, ledslingers, spots
- Audio: luidsprekers, mengpaneel, microfoons
- Andere: bierkannen, verfgereedschap, frigo's, en veel meer

Vraag je materiaal ruim op voorhand aan, zeker in drukke weken. VTK-evenementen hebben zelf ook materiaal nodig, dus beschikbaarheid is nooit gegarandeerd.

## Vervoer

Niet elke student heeft een auto waar een volledig interieur in past. Leden kunnen daarom de kar huren. Daar horen een paar afspraken bij.

- Huren kost 7,50 euro per uur, met een minimum van 7,50 euro.
- Je rijdt niet zelf. VTK voorziet een chauffeur; is er niemand vrij of staat de kar al ingepland, dan gaat het niet door.
- Onze chauffeurs zijn vrijwilligers. Voorzie zelf mankracht om in en uit te laden.
- Er rijden altijd een of twee bijrijders mee. Zonder bijrijders vertrekt de kar niet.
- We zijn geen verhuisfirma: een kar en een handvol vrijwilligers. We kunnen je dus niet altijd helpen.

## Voorwaarden

Wie materiaal of vervoer reserveert, gaat akkoord met de [uitleenvoorwaarden](https://drive.google.com/file/d/1B-W9ztC9uUO6WQdCAE-X8hO7bcjCitwF/view). Je bent verantwoordelijk voor wat je meeneemt: breng het terug zoals je het kreeg, en meld schade meteen in plaats van achteraf.`,
  contentMdEn: `VTK lends equipment and transport to its members and work groups. You reserve online with your VTK account. Questions are always welcome at <logistiek@vtk.be>.

## Equipment

Dressing up a party, fixing a bike, building up an activity: chances are the equipment service has it on the shelf.

- Hand tools: hammers, screwdrivers, spanners, saws
- Power tools: drills, a circular saw, a sander, extension cords
- Electrics: work lights, LED strings, spots
- Audio: speakers, a mixing desk, microphones
- Other: beer jugs, painting gear, fridges, and a lot more

Ask well in advance, certainly in busy weeks. VTK events need equipment too, so availability is never guaranteed.

## Transport

Not every student owns a car that fits a full flat. Members can therefore rent the van. A few rules come with it.

- Renting costs 7.50 euro per hour, with a minimum of 7.50 euro.
- You do not drive yourself. VTK provides a driver; if nobody is available or the van is already booked, it cannot go ahead.
- Our drivers are volunteers. Bring your own hands for loading and unloading.
- One or two passengers always come along. Without them the van stays put.
- We are not a moving company: one van and a handful of volunteers. We cannot always help.

## Conditions

Anyone reserving equipment or transport agrees to the [lending conditions](https://drive.google.com/file/d/1B-W9ztC9uUO6WQdCAE-X8hO7bcjCitwF/view). You are responsible for what you take with you: return it as you received it, and report damage straight away rather than afterwards.`,
};

export const SHIFTEN_PAGE: InfoPageContent = {
  titleNl: "Shiften",
  titleEn: "Shifts",
  excerptNl: "Help mee achter de schermen en spaar bonnetjes, gadgets en een feestje bij elkaar.",
  excerptEn: "Lend a hand behind the scenes and collect vouchers, gadgets and a party.",
  ctaLabelNl: "Naar de shiftenlijst",
  ctaLabelEn: "Go to the shift list",
  ctaUrl: "/shift",
  contentMdNl: `VTK draait op vrijwilligers. Achter elke cantus, elk feest, elke broodjesbalie en elke boekenverkoop staan leden die een shift opnemen. Je kiest zelf welke shift je doet, en je bent tot niets verplicht.

## Wat je ervoor krijgt

- Tijdens je shift drink je gratis.
- Per uur krijg je een medewerkersbonnetje ter waarde van 1 euro; voor uren na 02u00 is dat 1,5 bonnetje. Je besteedt ze in het Theokot of in 't ElixIr, niet op TD's of speciale activiteiten.
- Vanaf drie shiften ben je welkom op het medewerkersfeestje.
- Vanaf vijftien shiften ben je vaste medewerker: een eigen t-shirt en voorrang bij inschrijvingen voor evenementen.

## Ranking

Je shiften tellen door over het hele jaar. De beloningen haal je op het einde van het jaar op bij de vice.

- Medewerker, 3 shiften: uitnodiging voor het medewerkersfeestje
- Bronze, 10 shiften
- Vaste medewerker, 15 shiften: t-shirt en voorinschrijvingen
- Silver, 20 shiften
- Gold, 50 shiften

## Shiftersbingo

Naast de ranking loopt de shiftersbingo. Elke volledige rij of kolom op de [basiskaart](https://drive.google.com/file/d/1i4kuq3Wc8eWtRGZcJaiOl-H4vinBlooT/view) levert drie extra bonnetjes op. Op de [gevorderde kaart](https://drive.google.com/file/d/15d-MOzk4Sp9GQKTuocdidI49NL8xHK0y/view) verdien je er gadgets mee, van Theo- en Cudi-t-shirts tot VTK-multitools. Bezorg het bewijs van je voltooide vakjes aan de vice.

## Afspraken per werking

**Cantussen.** Een shift die een deel duurt, betaalt de helft van je inkom terug, tot maximaal de inkomprijs; twee keer tappen is dus een gratis cantus. Cantus je op water of eigen drank, dan cantus je gratis vanaf een shift die een deel duurt. Opbouw en afbraak zijn bonnetjesshiften. Een kwartier steward telt als shift, maar niet voor bonnetjes.

**Fakbar 't ElixIr.** Neventappen op een gewone avond levert zes medewerkersbonnetjes op. Op feestjes met kortere shiften geldt de gewone regel per uur.

**Theokot.** Bij een smeershift maak je ook je eigen broodje voor je lunch.

Voor grote activiteiten zoals het Galabal gelden aparte afspraken. Op de meeste activiteiten staat er medewerkersdrank klaar.

## Bonnetjes ophalen

Gespaarde bonnetjes haal je op bij de vice. Vraag hem wanneer hij in zijn ambtswoning is; die ligt op het gelijkvloers van blok 6 op de cité.

## Vragen

Vragen over shiften, problemen met de werklijsten, of wil je op de medewerkerslijst? Laat het de vice weten. Wie op die lijst staat, krijgt wekelijks een overzicht van de activiteiten en de openstaande shiften. Ook dat houdt geen verplichting in.`,
  contentMdEn: `VTK runs on volunteers. Behind every cantus, party, sandwich counter and book sale are members who take a shift. You pick the shifts you want, and you commit to nothing.

## What you get for it

- Your drinks are free during your shift.
- Every hour earns you a volunteer voucher worth 1 euro; hours after 02:00 earn 1.5. You spend them in Theokot or in 't ElixIr, not at parties or special activities.
- From three shifts on you are welcome at the volunteers' party.
- From fifteen shifts on you are a regular volunteer: your own t-shirt and priority when signing up for events.

## Ranking

Shifts add up across the whole year. You collect the rewards from the vice at the end of the year.

- Volunteer, 3 shifts: invitation to the volunteers' party
- Bronze, 10 shifts
- Regular volunteer, 15 shifts: t-shirt and early sign-up
- Silver, 20 shifts
- Gold, 50 shifts

## Shifters' bingo

Alongside the ranking there is the shifters' bingo. Every completed row or column on the [basic card](https://drive.google.com/file/d/1i4kuq3Wc8eWtRGZcJaiOl-H4vinBlooT/view) earns three extra vouchers. The [advanced card](https://drive.google.com/file/d/15d-MOzk4Sp9GQKTuocdidI49NL8xHK0y/view) earns gadgets, from Theo and Cudi t-shirts to VTK multitools. Send proof of your completed squares to the vice.

## Rules per service

**Cantus.** A shift lasting one part refunds half your entrance fee, up to the price of entry; tapping twice makes the cantus free. If you drink water or your own drinks, one shift of a part makes the cantus free. Setting up and clearing away are voucher shifts. A quarter of an hour as steward counts as a shift, but not for vouchers.

**Fakbar 't ElixIr.** Tapping on an ordinary evening earns six volunteer vouchers. At parties with shorter shifts, the normal hourly rule applies.

**Theokot.** A sandwich shift also lets you make your own lunch.

Separate rules apply to large activities such as the gala ball. Most activities have drinks for volunteers on hand.

## Collecting vouchers

You collect saved vouchers from the vice. Ask when he is in his official residence, on the ground floor of block 6 on the cité.

## Questions

Questions about shifts, trouble with the sign-up lists, or do you want to be on the volunteers' mailing list? Let the vice know. Everyone on that list gets a weekly overview of activities and open shifts. That, too, commits you to nothing.`,
};
