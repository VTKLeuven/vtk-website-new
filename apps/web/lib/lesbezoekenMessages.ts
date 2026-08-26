import {
  LESBEZOEK_LIMITS,
  LESBEZOEK_MAX_LEAD_DAYS,
  LESBEZOEK_MIN_LEAD_DAYS,
  type LesbezoekErrorCode,
} from "@/lib/lesbezoeken";

/**
 * Foutcodes van de lesbezoeken-acties naar meldingen die zeggen wát er misging.
 * Gedeeld door het publieke formulier en het beheer, zodat dezelfde code aan de
 * twee kanten hetzelfde betekent.
 */

export function lesbezoekRequestErrors(nl: boolean): Record<LesbezoekErrorCode, string> {
  return nl
    ? {
        ORGANISATION_REQUIRED: "Niet verstuurd: kies of typ de organisatie die langskomt.",
        ORGANISATION_TOO_LONG: `Niet verstuurd: de naam van de organisatie mag hoogstens ${LESBEZOEK_LIMITS.organisation} tekens zijn.`,
        EMAIL_REQUIRED: "Niet verstuurd: vul je eigen e-mailadres in.",
        EMAIL_INVALID: "Niet verstuurd: dat e-mailadres klopt niet.",
        EMAIL_TOO_LONG: "Niet verstuurd: dat e-mailadres is te lang.",
        NAME_TOO_LONG: `Niet verstuurd: je naam mag hoogstens ${LESBEZOEK_LIMITS.name} tekens zijn.`,
        PHONE_REQUIRED: "Niet verstuurd: vul een telefoonnummer in waarop we je kunnen bereiken.",
        PHONE_TOO_LONG: "Niet verstuurd: dat telefoonnummer is te lang.",
        SUBJECT_REQUIRED: "Niet verstuurd: vul in waarover het lesbezoek gaat.",
        SUBJECT_TOO_LONG: `Niet verstuurd: het onderwerp mag hoogstens ${LESBEZOEK_LIMITS.subject} tekens zijn.`,
        TEACHER_NOTE_REQUIRED:
          "Niet verstuurd: schrijf een toelichting voor de docent. Die tekst gaat letterlijk mee in onze mail.",
        TEACHER_NOTE_TOO_LONG: `Niet verstuurd: de toelichting mag hoogstens ${LESBEZOEK_LIMITS.teacherNote} tekens zijn.`,
        AUDIENCE_REQUIRED: "Niet verstuurd: kies een doelgroep.",
        AUDIENCE_TOO_LONG: "Niet verstuurd: die doelgroep is te lang.",
        COURSE_REQUIRED: "Niet verstuurd: vul in bij welk vak je wil langsgaan.",
        COURSE_TOO_LONG: "Niet verstuurd: die vaknaam is te lang.",
        TEACHER_EMAIL_REQUIRED: "Niet verstuurd: vul het mailadres van de docent in.",
        TEACHER_EMAIL_INVALID: "Niet verstuurd: het mailadres van de docent klopt niet.",
        DATE_REQUIRED: "Niet verstuurd: kies een datum en een tijdstip.",
        DATE_INVALID: "Niet verstuurd: die datum of dat tijdstip bestaat niet.",
        TOO_SOON: `Niet verstuurd: een lesbezoek moet minstens ${LESBEZOEK_MIN_LEAD_DAYS} dagen op voorhand aangevraagd worden. Anders halen we het antwoord van de docent niet meer.`,
        TOO_FAR: `Niet verstuurd: je kan hoogstens ${LESBEZOEK_MAX_LEAD_DAYS} dagen vooruit aanvragen.`,
        RATE_LIMITED:
          "Niet verstuurd: je diende net al verschillende aanvragen in. Probeer het over een kwartier opnieuw.",
      }
    : {
        ORGANISATION_REQUIRED: "Not sent: pick or type the organisation that is visiting.",
        ORGANISATION_TOO_LONG: `Not sent: the organisation name may be at most ${LESBEZOEK_LIMITS.organisation} characters.`,
        EMAIL_REQUIRED: "Not sent: fill in your own email address.",
        EMAIL_INVALID: "Not sent: that email address is not valid.",
        EMAIL_TOO_LONG: "Not sent: that email address is too long.",
        NAME_TOO_LONG: `Not sent: your name may be at most ${LESBEZOEK_LIMITS.name} characters.`,
        PHONE_REQUIRED: "Not sent: fill in a phone number we can reach you on.",
        PHONE_TOO_LONG: "Not sent: that phone number is too long.",
        SUBJECT_REQUIRED: "Not sent: fill in what the class visit is about.",
        SUBJECT_TOO_LONG: `Not sent: the subject may be at most ${LESBEZOEK_LIMITS.subject} characters.`,
        TEACHER_NOTE_REQUIRED:
          "Not sent: write a note for the lecturer. That text goes into our email word for word.",
        TEACHER_NOTE_TOO_LONG: `Not sent: the note may be at most ${LESBEZOEK_LIMITS.teacherNote} characters.`,
        AUDIENCE_REQUIRED: "Not sent: pick a target group.",
        AUDIENCE_TOO_LONG: "Not sent: that target group is too long.",
        COURSE_REQUIRED: "Not sent: fill in which course you want to visit.",
        COURSE_TOO_LONG: "Not sent: that course name is too long.",
        TEACHER_EMAIL_REQUIRED: "Not sent: fill in the lecturer's email address.",
        TEACHER_EMAIL_INVALID: "Not sent: the lecturer's email address is not valid.",
        DATE_REQUIRED: "Not sent: pick a date and a time.",
        DATE_INVALID: "Not sent: that date or time does not exist.",
        TOO_SOON: `Not sent: a class visit must be requested at least ${LESBEZOEK_MIN_LEAD_DAYS} days in advance. Otherwise the lecturer's reply comes too late.`,
        TOO_FAR: `Not sent: you can request at most ${LESBEZOEK_MAX_LEAD_DAYS} days ahead.`,
        RATE_LIMITED:
          "Not sent: you just submitted several requests. Try again in about fifteen minutes.",
      };
}

/** De codes die enkel uit het beheer komen. */
export function lesbezoekAdminErrors(nl: boolean): Record<string, string> {
  return nl
    ? {
        ...lesbezoekRequestErrors(true),
        INVALID_INPUT: "Niet opgeslagen: kijk de ingevulde velden na.",
        NOT_FOUND: "Niet opgeslagen: dit lesbezoek bestaat niet meer.",
        REASON_REQUIRED:
          "Niet opgeslagen: schrijf er een reden bij. Die komt in de mail naar de aanvrager terecht.",
        ORGANISATION_TAKEN: "Niet opgeslagen: er bestaat al een organisatie met die naam.",
        MAIL_EMPTY: "Niet verstuurd: de mail heeft een onderwerp en een tekst nodig.",
        MAIL_FAILED: "De mail is niet vertrokken. Probeer het opnieuw of verwittig IT.",
        NO_RECIPIENT: "Niet verstuurd: er staat geen adres bij deze aanvraag.",
        SCHEDULE_TIME_INVALID: "Niet ingepland: kies een geldige datum en een geldig tijdstip.",
        SCHEDULE_TIME_PAST: "Niet ingepland: kies een tijdstip in de toekomst.",
        SCHEDULED_MAIL_NOT_FOUND: "Niet gevonden: deze geplande mail bestaat niet meer.",
      }
    : {
        ...lesbezoekRequestErrors(false),
        INVALID_INPUT: "Not saved: please check the fields you entered.",
        NOT_FOUND: "Not saved: this classroom visit no longer exists.",
        REASON_REQUIRED:
          "Not saved: add a reason. It goes into the email to the requester.",
        ORGANISATION_TAKEN: "Not saved: an organisation with that name already exists.",
        MAIL_EMPTY: "Not sent: the email needs a subject and a body.",
        MAIL_FAILED: "The email did not go out. Try again or let IT know.",
        NO_RECIPIENT: "Not sent: there is no address on this request.",
        SCHEDULE_TIME_INVALID: "Not scheduled: pick a valid date and time.",
        SCHEDULE_TIME_PAST: "Not scheduled: pick a time in the future.",
        SCHEDULED_MAIL_NOT_FOUND: "Not found: this scheduled email no longer exists.",
      };
}
