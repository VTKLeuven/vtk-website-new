import { RENTAL_LIMITS, RENTAL_MAX_LEAD_DAYS, type RentalErrorCode } from "@/lib/theokotVerhuur";

/**
 * Foutcodes van de verhuuracties naar meldingen die zeggen wát er misging.
 * Gedeeld door het publieke formulier en het beheer, zodat dezelfde code aan de
 * twee kanten hetzelfde betekent.
 */

export function rentalRequestErrors(nl: boolean): Record<RentalErrorCode, string> {
  return nl
    ? {
        NAME_REQUIRED: "Niet verstuurd: vul de naam van de verantwoordelijke in.",
        NAME_TOO_LONG: `Niet verstuurd: die naam mag hoogstens ${RENTAL_LIMITS.name} tekens zijn.`,
        EMAIL_REQUIRED: "Niet verstuurd: vul een e-mailadres in.",
        EMAIL_INVALID: "Niet verstuurd: dat e-mailadres klopt niet.",
        EMAIL_TOO_LONG: "Niet verstuurd: dat e-mailadres is te lang.",
        PHONE_REQUIRED: "Niet verstuurd: vul een telefoonnummer in waarop we je kunnen bereiken.",
        PHONE_TOO_LONG: "Niet verstuurd: dat telefoonnummer is te lang.",
        DATE_REQUIRED: "Niet verstuurd: kies de dag waarop je de zaal wil gebruiken.",
        DATE_INVALID: "Niet verstuurd: die datum bestaat niet.",
        TIME_REQUIRED: "Niet verstuurd: vul een start- en een einduur in, in de vorm 20:00.",
        TIME_ORDER: "Niet verstuurd: het einduur mag niet gelijk zijn aan het startuur.",
        IN_PAST: "Niet verstuurd: die datum is al voorbij.",
        TOO_SOON:
          "Niet verstuurd: deze aanvraag komt te laat. Kijk bij de richtlijnen hoeveel dagen op voorhand we ze nodig hebben.",
        TOO_FAR: `Niet verstuurd: je kan hoogstens ${RENTAL_MAX_LEAD_DAYS} dagen vooruit reserveren.`,
        PURPOSE_REQUIRED: "Niet verstuurd: beschrijf kort waarvoor je de zaal wil gebruiken.",
        PURPOSE_TOO_LONG: `Niet verstuurd: die omschrijving mag hoogstens ${RENTAL_LIMITS.purpose} tekens zijn.`,
        ATTENDEES_REQUIRED: "Niet verstuurd: vul in hoeveel mensen er aanwezig zullen zijn.",
        ATTENDEES_INVALID: `Niet verstuurd: vul een aantal in tussen 1 en ${RENTAL_LIMITS.attendees}.`,
        REMARKS_REQUIRED: "Niet verstuurd: vul de opmerkingen in.",
        REMARKS_TOO_LONG: `Niet verstuurd: de opmerkingen mogen hoogstens ${RENTAL_LIMITS.remarks} tekens zijn.`,
        DEPOSIT_REQUIRED: "Niet verstuurd: kies hoe je de waarborg wil betalen.",
        EXTRA_REQUIRED: "Niet verstuurd: er is nog een verplichte vraag niet ingevuld.",
        EXTRA_TOO_LONG: "Niet verstuurd: een van je antwoorden is te lang.",
        CLOSED:
          "Niet verstuurd: het aanvraagformulier staat op dit moment dicht. Mail ons gerust.",
        RATE_LIMITED:
          "Niet verstuurd: je diende net al verschillende aanvragen in. Probeer het over een kwartier opnieuw.",
      }
    : {
        NAME_REQUIRED: "Not sent: fill in the name of the person in charge.",
        NAME_TOO_LONG: `Not sent: that name may be at most ${RENTAL_LIMITS.name} characters.`,
        EMAIL_REQUIRED: "Not sent: fill in an email address.",
        EMAIL_INVALID: "Not sent: that email address is not valid.",
        EMAIL_TOO_LONG: "Not sent: that email address is too long.",
        PHONE_REQUIRED: "Not sent: fill in a phone number we can reach you on.",
        PHONE_TOO_LONG: "Not sent: that phone number is too long.",
        DATE_REQUIRED: "Not sent: pick the day you want to use the room.",
        DATE_INVALID: "Not sent: that date does not exist.",
        TIME_REQUIRED: "Not sent: fill in a starting and an ending hour, like 20:00.",
        TIME_ORDER: "Not sent: the ending hour cannot be the same as the starting hour.",
        IN_PAST: "Not sent: that date has already passed.",
        TOO_SOON:
          "Not sent: this request comes too late. The guidelines say how many days ahead we need it.",
        TOO_FAR: `Not sent: you can book at most ${RENTAL_MAX_LEAD_DAYS} days ahead.`,
        PURPOSE_REQUIRED: "Not sent: briefly describe what you want to use the room for.",
        PURPOSE_TOO_LONG: `Not sent: that description may be at most ${RENTAL_LIMITS.purpose} characters.`,
        ATTENDEES_REQUIRED: "Not sent: fill in how many people will be present.",
        ATTENDEES_INVALID: `Not sent: fill in a number between 1 and ${RENTAL_LIMITS.attendees}.`,
        REMARKS_REQUIRED: "Not sent: fill in the remarks.",
        REMARKS_TOO_LONG: `Not sent: the remarks may be at most ${RENTAL_LIMITS.remarks} characters.`,
        DEPOSIT_REQUIRED: "Not sent: pick how you want to pay the deposit.",
        EXTRA_REQUIRED: "Not sent: one of the required questions is still empty.",
        EXTRA_TOO_LONG: "Not sent: one of your answers is too long.",
        CLOSED: "Not sent: the request form is closed at the moment. Feel free to email us.",
        RATE_LIMITED:
          "Not sent: you just submitted several requests. Try again in about fifteen minutes.",
      };
}

/** De codes die enkel uit het beheer komen. */
export function rentalAdminErrors(nl: boolean): Record<string, string> {
  return nl
    ? {
        ...rentalRequestErrors(true),
        INVALID_INPUT: "Niet opgeslagen: kijk de ingevulde velden na.",
        NOT_FOUND: "Niet opgeslagen: deze aanvraag bestaat niet meer.",
        MAIL_EMPTY: "Niet verstuurd: de mail heeft een onderwerp en een tekst nodig.",
        MAIL_FAILED: "De mail is niet vertrokken. Probeer het opnieuw of verwittig IT.",
        NO_RECIPIENT: "Niet verstuurd: er staat geen adres bij deze aanvraag.",
        NO_NOTIFY_EMAIL:
          "Niet opgeslagen: vul minstens één adres in dat de meldingen mag ontvangen.",
        TEMPLATE_NOT_FOUND: "Niet verstuurd: dat sjabloon bestaat niet meer.",
        TEMPLATE_EMPTY: "Niet opgeslagen: een sjabloon heeft een naam, een onderwerp en een tekst nodig.",
        QUESTION_EMPTY: "Niet opgeslagen: elke vraag heeft minstens een Nederlands label nodig.",
        FILE_REQUIRED: "Niet opgeslagen: kies eerst een pdf-bestand.",
        FILE_NOT_PDF: "Niet opgeslagen: het huurcontract moet een pdf zijn.",
        FILE_TOO_LARGE: "Niet opgeslagen: dat bestand is te groot (hoogstens 15 MB).",
        CONTRACT_MISSING:
          "Niet verstuurd: er staat nog geen huurcontract klaar voor dit soort huurder. Upload het eerst bij de instellingen, of zet de bijlage uit.",
      }
    : {
        ...rentalRequestErrors(false),
        INVALID_INPUT: "Not saved: please check the fields you entered.",
        NOT_FOUND: "Not saved: this request no longer exists.",
        MAIL_EMPTY: "Not sent: the email needs a subject and a body.",
        MAIL_FAILED: "The email did not go out. Try again or let IT know.",
        NO_RECIPIENT: "Not sent: there is no address on this request.",
        NO_NOTIFY_EMAIL: "Not saved: fill in at least one address that receives the notifications.",
        TEMPLATE_NOT_FOUND: "Not sent: that template no longer exists.",
        TEMPLATE_EMPTY: "Not saved: a template needs a name, a subject and a body.",
        QUESTION_EMPTY: "Not saved: every question needs at least a Dutch label.",
        FILE_REQUIRED: "Not saved: pick a PDF file first.",
        FILE_NOT_PDF: "Not saved: the rental contract has to be a PDF.",
        FILE_TOO_LARGE: "Not saved: that file is too large (15 MB at most).",
        CONTRACT_MISSING:
          "Not sent: there is no rental contract ready for this kind of renter yet. Upload it in the settings first, or turn the attachment off.",
      };
}
