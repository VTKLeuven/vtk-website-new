import {
  PAL_PLUS_LIMITS,
  PAL_PLUS_MAX_ACTIVE_REQUESTS,
  PAL_PLUS_MAX_LEAD_DAYS,
  PAL_PLUS_MAX_SESSION_MINUTES,
  type PalPlusCourseErrorCode,
  type PalPlusRequestErrorCode,
} from "@/lib/palPlus";

/**
 * Foutcodes van de PAL+-acties naar meldingen die zeggen wát er misging.
 */
export function palPlusCourseErrors(nl: boolean): Record<PalPlusCourseErrorCode, string> {
  return nl
    ? {
        COURSE_NAME_REQUIRED: "Niet opgeslagen: vul de Nederlandse naam van het vak in.",
        COURSE_NAME_TOO_LONG: `Niet opgeslagen: een vaknaam mag hoogstens ${PAL_PLUS_LIMITS.courseName} tekens zijn.`,
        COURSE_CODE_INVALID:
          "Niet opgeslagen: een OPO-code bestaat enkel uit letters en cijfers, zoals H01A0B. Laat het veld leeg voor iets wat geen vak is.",
        COURSE_CODE_TAKEN: "Niet opgeslagen: er staat al een vak met die OPO-code in de lijst.",
        COURSE_IN_USE:
          "Niet verwijderd: er hangen al aanvragen of sessies aan dit vak. Zet het uit, dan verdwijnt het uit het aanvraagformulier en blijft de historiek staan.",
      }
    : {
        COURSE_NAME_REQUIRED: "Not saved: fill in the Dutch name of the course.",
        COURSE_NAME_TOO_LONG: `Not saved: a course name can be at most ${PAL_PLUS_LIMITS.courseName} characters.`,
        COURSE_CODE_INVALID:
          "Not saved: a course code only has letters and digits, like H01A0B. Leave it empty for something that is not a course.",
        COURSE_CODE_TAKEN: "Not saved: a course with that code is already on the list.",
        COURSE_IN_USE:
          "Not deleted: requests or sessions are already attached to this course. Switch it off instead; it leaves the request form and its history stays.",
      };
}

/** Wat de indiener kan tegenkomen: het formulier, steunen en intrekken. */
export type PalPlusMemberErrorCode =
  | PalPlusRequestErrorCode
  | "REQUEST_NOT_OPEN"
  | "OWN_REQUEST"
  | "NOT_WITHDRAWABLE";

export function palPlusMemberErrors(nl: boolean): Record<PalPlusMemberErrorCode, string> {
  const hours = PAL_PLUS_MAX_SESSION_MINUTES / 60;
  return nl
    ? {
        LOGIN_REQUIRED: "Niet verstuurd: je sessie is verlopen. Log opnieuw in en probeer het nog eens.",
        COURSE_REQUIRED: "Niet verstuurd: kies een vak, of tik het in als het niet in de lijst staat.",
        COURSE_UNKNOWN:
          "Niet verstuurd: dat vak staat niet meer in de lijst. Herlaad de pagina en kies opnieuw.",
        COURSE_OTHER_TOO_LONG: `Niet verstuurd: de naam van het vak mag hoogstens ${PAL_PLUS_LIMITS.courseOther} tekens zijn.`,
        DESCRIPTION_REQUIRED: "Niet verstuurd: beschrijf kort wat voor sessie het moet worden.",
        DESCRIPTION_TOO_LONG: `Niet verstuurd: de omschrijving mag hoogstens ${PAL_PLUS_LIMITS.description} tekens zijn.`,
        PERIOD_TOO_LONG: `Niet verstuurd: wanneer je het nodig hebt, mag hoogstens ${PAL_PLUS_LIMITS.preferredPeriod} tekens zijn.`,
        MOMENT_REQUIRED: "Niet verstuurd: kies een datum, een beginuur en een einduur.",
        MOMENT_INVALID: "Niet verstuurd: die datum of dat uur bestaat niet.",
        MOMENT_ORDER: "Niet verstuurd: het einduur moet na het beginuur liggen.",
        MOMENT_TOO_LONG: `Niet verstuurd: een sessie duurt hoogstens ${hours} uur. Klopt het einduur?`,
        MOMENT_PAST: "Niet verstuurd: dat moment is al voorbij.",
        MOMENT_TOO_FAR: `Niet verstuurd: je kan hoogstens ${PAL_PLUS_MAX_LEAD_DAYS} dagen vooruit een moment voorstellen.`,
        TOO_MANY_ACTIVE: `Niet verstuurd: je hebt al ${PAL_PLUS_MAX_ACTIVE_REQUESTS} aanvragen openstaan. Trek er een in die je niet meer nodig hebt.`,
        REQUEST_NOT_OPEN: "Die vraag staat niet meer open: er is al een sessie voor gepland, of ze werd gesloten.",
        OWN_REQUEST: "Dit is je eigen vraag; die telt al mee.",
        NOT_WITHDRAWABLE:
          "Niet ingetrokken: Onderwijs heeft deze aanvraag al afgehandeld. Mail Onderwijs als er iets veranderd is.",
      }
    : {
        LOGIN_REQUIRED: "Not sent: your session expired. Log in again and try once more.",
        COURSE_REQUIRED: "Not sent: pick a course, or type it in if it is not on the list.",
        COURSE_UNKNOWN: "Not sent: that course is no longer on the list. Reload the page and pick again.",
        COURSE_OTHER_TOO_LONG: `Not sent: the course name can be at most ${PAL_PLUS_LIMITS.courseOther} characters.`,
        DESCRIPTION_REQUIRED: "Not sent: briefly describe what kind of session it should be.",
        DESCRIPTION_TOO_LONG: `Not sent: the description can be at most ${PAL_PLUS_LIMITS.description} characters.`,
        PERIOD_TOO_LONG: `Not sent: when you need it can be at most ${PAL_PLUS_LIMITS.preferredPeriod} characters.`,
        MOMENT_REQUIRED: "Not sent: pick a date, a start time and an end time.",
        MOMENT_INVALID: "Not sent: that date or time does not exist.",
        MOMENT_ORDER: "Not sent: the end time has to be after the start time.",
        MOMENT_TOO_LONG: `Not sent: a session lasts at most ${hours} hours. Is the end time right?`,
        MOMENT_PAST: "Not sent: that moment has already passed.",
        MOMENT_TOO_FAR: `Not sent: you can propose a moment at most ${PAL_PLUS_MAX_LEAD_DAYS} days ahead.`,
        TOO_MANY_ACTIVE: `Not sent: you already have ${PAL_PLUS_MAX_ACTIVE_REQUESTS} open requests. Withdraw one you no longer need.`,
        REQUEST_NOT_OPEN: "That request is no longer open: a session was planned for it, or it was closed.",
        OWN_REQUEST: "This is your own request; it already counts.",
        NOT_WITHDRAWABLE:
          "Not withdrawn: Onderwijs has already handled this request. Email Onderwijs if something changed.",
      };
}

export type PalPlusAdminErrorCode =
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "NOT_ACTIVE"
  | "NOT_CLOSED"
  | "COURSE_UNKNOWN";

export function palPlusAdminErrors(nl: boolean): Record<PalPlusAdminErrorCode, string> {
  return nl
    ? {
        REASON_REQUIRED: "Niet gesloten: schrijf een reden. De indiener ziet die bij de aanvraag.",
        REASON_TOO_LONG: `Niet gesloten: de reden mag hoogstens ${PAL_PLUS_LIMITS.reviewNote} tekens zijn.`,
        NOT_ACTIVE: "Niet gesloten: de aanvraag is ondertussen al afgehandeld of ingetrokken. Herlaad de pagina.",
        NOT_CLOSED: "Niet heropend: enkel een gesloten aanvraag kan terug open.",
        COURSE_UNKNOWN: "Niet opgeslagen: dat vak bestaat niet meer. Herlaad de pagina.",
      }
    : {
        REASON_REQUIRED: "Not closed: write a reason. The submitter sees it with the request.",
        REASON_TOO_LONG: `Not closed: the reason can be at most ${PAL_PLUS_LIMITS.reviewNote} characters.`,
        NOT_ACTIVE: "Not closed: the request was handled or withdrawn in the meantime. Reload the page.",
        NOT_CLOSED: "Not reopened: only a closed request can be reopened.",
        COURSE_UNKNOWN: "Not saved: that course no longer exists. Reload the page.",
      };
}
