import "server-only";

import { prisma } from "@vtk/db";

export const TICKET_TERMS_SETTING_KEY = "tickets.terms";

export type TicketTerms = {
  version: string;
  bodyNl: string;
  bodyEn: string;
};

/** Fallback uit de bestaande VTK-pagina in scripts/pages-import.json. */
export const DEFAULT_TICKET_TERMS: TicketTerms = {
  version: "2025-11-23",
  bodyNl: `## 1. Inleiding
Deze algemene voorwaarden (hierna: "Voorwaarden") zijn van toepassing op alle ticketverkopen door Vlaamse Technische Kring vzw (hierna: "VTK", "wij", "ons", "onze") aan u als koper (hierna: "u", "uw"). Door het aankopen van tickets via onze website [https://vtk.be](https://vtk.be) (hierna: "Website") of enige andere verkoopkanalen die wij aanbieden, gaat u akkoord met deze Voorwaarden.

## 2. Ticketverkoop en -Gebruik
2.1 Aangekochte tickets zijn bestemd voor persoonlijk gebruik. Het is toegestaan om tickets door te verkopen of over te dragen, op voorwaarde dat de prijs niet hoger is dan de oorspronkelijke aankoopprijs. VTK behoudt zich het recht om voor specifieke evenementen af te wijken van deze regel en doorverkoop te verbieden.

2.2 De aankoop van tickets is definitief. Tickets worden niet teruggenomen, terugbetaald of omgewisseld, tenzij het evenement wordt geannuleerd of verplaatst. In geval van annulering zal de terugbetaling enkel de nominale waarde van het ticket omvatten.

## 3. Lidmaatschap en Tarieven
3.1 Onder 'lid' wordt verstaan: een natuurlijk persoon die op het moment van de aankoop beschikt over een geldig en lopend lidmaatschap bij VTK.
* Voor studenten aan de Faculteit Ingenieurswetenschappen is het lidmaatschap kosteloos, echter is een bevestiging via de website vereist.
* Niet-faculteitsstudenten kunnen het lidmaatschap verkrijgen door de aanschaf van een niet-facultair lidmaatschap via de Cursusdienst. Dit lidmaatschap is geldig voor de duur van het betreffende academiejaar.

Het lidmaatschap dient op eerste verzoek te kunnen worden aangetoond middels een geldige studentenkaart of door een ander VTK erkend bewijsstuk.

3.2 Het ledentarief is strikt persoonlijk en uitsluitend voorbehouden aan leden zoals gedefinieerd in artikel 3.1. Indien een koper een ticket aan ledentarief aanschaft zonder op het moment van aankoop geldig lid te zijn, is de koper van rechtswege en zonder voorafgaande ingebrekestelling een administratieve toeslag verschuldigd. Deze toeslag bedraagt tweemaal het verschil tussen het betaalde ledentarief en het op dat moment geldende reguliere tarief. VTK behoudt zich het recht voor om de toegang tot het evenement te ontzeggen zolang deze toeslag niet is voldaan.

## 4. Toegang tot Evenementen
4.1 Een geldig ticket is vereist voor toegang tot het evenement. U dient uw ticket bij de ingang te tonen, in gedrukte vorm of op een mobiel apparaat.

4.2 VTK behoudt zich het recht voor om toegang te weigeren aan iedereen die niet voldoet aan de toegangsvoorwaarden van het evenement, inclusief, maar niet beperkt tot, passende gedragsnormen en leeftijdsrestricties.

## 5. Annulering, Wijziging en Verplaatsing van Evenementen
5.1 VTK behoudt zich het recht voor om een evenement te annuleren, uit te stellen of te wijzigen wegens onvoorziene omstandigheden of situaties buiten onze controle.

5.2 In geval van annulering zal VTK zich inspannen om kopers zo snel mogelijk te informeren en instructies te geven voor terugbetaling of omruiling.

## 6. Aansprakelijkheid
6.1 VTK is niet aansprakelijk voor enige directe, indirecte of gevolgschade die voortvloeit uit de annulering, wijziging of verplaatsing van een evenement.

6.2 De aansprakelijkheid van VTK voor andere claims gerelateerd aan de aankoop van tickets is beperkt tot de prijs van het aangekochte ticket.

## 7. Privacy
7.1 Persoonsgegevens die worden verzameld tijdens het aankoopproces worden verwerkt in overeenstemming met ons Privacybeleid, beschikbaar op onze website.

7.2 VTK behoudt het recht om foto's en video-opnames te nemen en deze te gebruiken voor commerciële doeleinden.

## 8. Slotbepalingen
8.1 Op deze Voorwaarden is Belgisch recht van toepassing. Eventuele geschillen die voortvloeien uit of verband houden met deze Voorwaarden zullen worden voorgelegd aan de bevoegde rechtbank in België.

8.2 VTK behoudt zich het recht voor om deze Voorwaarden op elk moment te wijzigen. De meest actuele versie van de Voorwaarden is beschikbaar op onze Website.

## Contact
Voor vragen of opmerkingen over deze Voorwaarden kunt u contact met ons opnemen via [vtk@vtk.be](mailto:vtk@vtk.be).

Laatst bijgewerkt: 23 november 2025.`,
  bodyEn: `## 1. Introduction
These general terms and conditions (hereinafter: "Terms") apply to all ticket sales by Vlaamse Technische Kring vzw (hereinafter: "VTK", "we", "us", "our") to you as the buyer (hereinafter: "you", "your"). By purchasing tickets via our website [https://vtk.be](https://vtk.be) (hereinafter: "Website") or any other sales channels we offer, you agree to these Terms.

## 2. Ticket Sales and Use
2.1 Purchased tickets are intended for personal use. It is permitted to resell or transfer tickets, provided that the price is not higher than the original purchase price. VTK reserves the right to deviate from this rule for specific events and to prohibit resale.

2.2 The purchase of tickets is final. Tickets will not be taken back, refunded, or exchanged, unless the event is cancelled or rescheduled. In the event of cancellation, the refund will only cover the nominal value of the ticket.

## 3. Membership and Rates
3.1 A 'member' is defined as: a natural person who, at the moment of purchase, possesses a valid and current membership with VTK.
* For students at the Faculty of Engineering Science, membership is free of charge; however, confirmation via the website is required.
* Non-faculty students can obtain membership by purchasing a non-faculty membership via the Course Service. This membership is valid for the duration of the relevant academic year.

Membership must be demonstrable upon first request by means of a valid student card or another proof recognized by VTK.

3.2 The member rate is strictly personal and exclusively reserved for members as defined in Article 3.1. If a buyer purchases a ticket at the member rate without being a valid member at the time of purchase, the buyer owes an administrative surcharge by operation of law and without prior notice of default. This surcharge amounts to twice the difference between the paid member rate and the regular rate applicable at that time. VTK reserves the right to deny access to the event as long as this surcharge has not been paid.

## 4. Access to Events
4.1 A valid ticket is required for admission to the event. You must present your ticket at the entrance, either in printed form or on a mobile device.

4.2 VTK reserves the right to refuse entry to anyone who does not meet the event's entry conditions, including, but not limited to, appropriate behavioral standards and age restrictions.

## 5. Cancellation, Change, and Rescheduling of Events
5.1 VTK reserves the right to cancel, postpone, or modify an event due to unforeseen circumstances or situations beyond our control.

5.2 In the event of cancellation, VTK will make every effort to inform buyers as soon as possible and provide instructions for a refund or exchange.

## 6. Liability
6.1 VTK is not liable for any direct, indirect, or consequential damage arising from the cancellation, modification, or rescheduling of an event.

6.2 VTK's liability for other claims related to the purchase of tickets is limited to the price of the purchased ticket.

## 7. Privacy
7.1 Personal data collected during the purchasing process are processed in accordance with our Privacy Policy, available on our website.

7.2 VTK reserves the right to take photos and video recordings and to use these for commercial purposes.

## 8. Final Provisions
8.1 Belgian law applies to these Terms. Any disputes arising from or related to these Terms will be submitted to the competent court in Belgium.

8.2 VTK reserves the right to amend these Terms at any time. The most current version of the Terms is available on our Website.

## Contact
For questions or comments regarding these Terms, you may contact us via [vtk@vtk.be](mailto:vtk@vtk.be).

Last updated: November 23, 2025.`,
};

export function parseTicketTerms(value: unknown): TicketTerms {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_TICKET_TERMS;
  }
  const candidate = value as Record<string, unknown>;
  return {
    version:
      typeof candidate.version === "string" && candidate.version.trim()
        ? candidate.version.trim()
        : DEFAULT_TICKET_TERMS.version,
    bodyNl:
      typeof candidate.bodyNl === "string" && candidate.bodyNl.trim()
        ? candidate.bodyNl
        : DEFAULT_TICKET_TERMS.bodyNl,
    bodyEn:
      typeof candidate.bodyEn === "string" && candidate.bodyEn.trim()
        ? candidate.bodyEn
        : DEFAULT_TICKET_TERMS.bodyEn,
  };
}

export async function getTicketTerms(): Promise<TicketTerms> {
  const setting = await prisma.setting.findUnique({
    where: { key: TICKET_TERMS_SETTING_KEY },
    select: { value: true },
  });
  return parseTicketTerms(setting?.value);
}

export function ticketTermsPath(locale: "nl" | "en"): string {
  return `${locale === "en" ? "/en" : ""}/tickets/voorwaarden`;
}
