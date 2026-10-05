import {
  PAL_PLUS_LIMITS,
  PAL_PLUS_MAX_ACTIVE_REQUESTS,
  PAL_PLUS_MAX_REWARD,
  PAL_PLUS_MAX_SESSION_MINUTES,
  type PalPlusCourseErrorCode,
  type PalPlusDaypartErrorCode,
  type PalPlusRequestErrorCode,
  type PalPlusSessionErrorCode,
  type PalPlusSignupBlock,
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
  | PalPlusSignupBlock
  | "REQUEST_NOT_OPEN"
  | "OWN_REQUEST"
  | "NOT_WITHDRAWABLE"
  | "SESSION_GONE"
  | "NOT_STARTED"
  | "NOT_ALLOWED"
  | "NOT_INVITED"
  | "INVITATION_GONE";

export function palPlusMemberErrors(nl: boolean): Record<PalPlusMemberErrorCode, string> {
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
        TAG_TOO_LONG: `Niet verstuurd: een tag mag hoogstens ${PAL_PLUS_LIMITS.tag} tekens zijn. Zet de uitleg liever in de omschrijving.`,
        TOO_MANY_TAGS: `Niet verstuurd: hoogstens ${PAL_PLUS_LIMITS.tags} tags. Haal er een paar weg.`,
        AVAILABILITY_REQUIRED: "Niet verstuurd: duid aan wanneer je meestal kan, of schrijf het in de opmerking.",
        AVAILABILITY_INVALID:
          "Niet verstuurd: de dagdelen van het rooster veranderden net. Herlaad de pagina en duid opnieuw aan.",
        AVAILABILITY_NOTE_TOO_LONG: `Niet verstuurd: de opmerking bij wanneer je kan, mag hoogstens ${PAL_PLUS_LIMITS.availabilityNote} tekens zijn.`,
        COTUTOR_INVALID: "Niet verstuurd: een r-nummer is een r gevolgd door zeven cijfers, zoals r0123456.",
        COTUTOR_UNKNOWN:
          "Niet verstuurd: er is geen account met dat r-nummer. Vraag je medetutor eerst eens in te loggen op vtk.be.",
        COTUTOR_SELF: "Niet verstuurd: dat is je eigen r-nummer. Vul dat van je medetutor in, of laat het veld leeg.",
        TOO_MANY_ACTIVE: `Niet verstuurd: je hebt al ${PAL_PLUS_MAX_ACTIVE_REQUESTS} aanvragen openstaan. Trek er een in die je niet meer nodig hebt.`,
        REQUEST_NOT_OPEN: "Die vraag staat niet meer open: er is al een sessie voor gepland, of ze werd gesloten.",
        OWN_REQUEST: "Dit is je eigen vraag; die telt al mee.",
        NOT_WITHDRAWABLE:
          "Niet ingetrokken: Onderwijs heeft deze aanvraag al afgehandeld. Mail Onderwijs als er iets veranderd is.",
        CANCELLED: "Deze sessie gaat niet door; ze werd geannuleerd.",
        STARTED: "Deze sessie is al begonnen. Inschrijven of uitschrijven kan niet meer.",
        FULL: "Niet ingeschreven: de sessie is volzet.",
        IS_TUTOR: "Je geeft deze sessie zelf; inschrijven hoeft niet.",
        SESSION_GONE: "Die sessie bestaat niet meer. Herlaad de pagina.",
        NOT_STARTED: "De sessie is nog niet begonnen; wie kwam, duid je aan zodra ze bezig is.",
        NOT_ALLOWED: "Enkel een tutor van deze sessie of Onderwijs duidt aan wie er kwam.",
        NOT_INVITED: "Je bent niet uitgenodigd voor dit aanbod.",
        INVITATION_GONE:
          "Deze uitnodiging geldt niet meer: Onderwijs plande het aanbod al, sloot het, of het werd ingetrokken.",
      }
    : {
        LOGIN_REQUIRED: "Not sent: your session expired. Log in again and try once more.",
        COURSE_REQUIRED: "Not sent: pick a course, or type it in if it is not on the list.",
        COURSE_UNKNOWN: "Not sent: that course is no longer on the list. Reload the page and pick again.",
        COURSE_OTHER_TOO_LONG: `Not sent: the course name can be at most ${PAL_PLUS_LIMITS.courseOther} characters.`,
        DESCRIPTION_REQUIRED: "Not sent: briefly describe what kind of session it should be.",
        DESCRIPTION_TOO_LONG: `Not sent: the description can be at most ${PAL_PLUS_LIMITS.description} characters.`,
        PERIOD_TOO_LONG: `Not sent: when you need it can be at most ${PAL_PLUS_LIMITS.preferredPeriod} characters.`,
        TAG_TOO_LONG: `Not sent: a tag can be at most ${PAL_PLUS_LIMITS.tag} characters. Put the explanation in the description instead.`,
        TOO_MANY_TAGS: `Not sent: at most ${PAL_PLUS_LIMITS.tags} tags. Remove a few.`,
        AVAILABILITY_REQUIRED: "Not sent: mark when you are usually available, or write it in the note.",
        AVAILABILITY_INVALID: "Not sent: the parts of the day just changed. Reload the page and mark them again.",
        AVAILABILITY_NOTE_TOO_LONG: `Not sent: the note on when you are available can be at most ${PAL_PLUS_LIMITS.availabilityNote} characters.`,
        COTUTOR_INVALID: "Not sent: an r-number is an r followed by seven digits, like r0123456.",
        COTUTOR_UNKNOWN: "Not sent: there is no account with that r-number. Ask your co-tutor to log in on vtk.be once first.",
        COTUTOR_SELF: "Not sent: that is your own r-number. Fill in your co-tutor's, or leave the field empty.",
        TOO_MANY_ACTIVE: `Not sent: you already have ${PAL_PLUS_MAX_ACTIVE_REQUESTS} open requests. Withdraw one you no longer need.`,
        REQUEST_NOT_OPEN: "That request is no longer open: a session was planned for it, or it was closed.",
        OWN_REQUEST: "This is your own request; it already counts.",
        NOT_WITHDRAWABLE:
          "Not withdrawn: Onderwijs has already handled this request. Email Onderwijs if something changed.",
        CANCELLED: "This session is not going ahead; it was cancelled.",
        STARTED: "This session has already started. You can no longer sign up or leave.",
        FULL: "Not signed up: the session is full.",
        IS_TUTOR: "You are giving this session yourself; no need to sign up.",
        SESSION_GONE: "That session no longer exists. Reload the page.",
        NOT_STARTED: "The session has not started yet; mark who came once it is under way.",
        NOT_ALLOWED: "Only a tutor of this session or Onderwijs marks who came.",
        NOT_INVITED: "You are not invited for this offer.",
        INVITATION_GONE:
          "This invitation no longer applies: Onderwijs already planned the offer, closed it, or it was withdrawn.",
      };
}

export type PalPlusAdminErrorCode =
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "NOT_ACTIVE"
  | "NOT_CLOSED"
  | "COURSE_UNKNOWN"
  | "NOT_PUBLISHABLE";

export function palPlusAdminErrors(nl: boolean): Record<PalPlusAdminErrorCode, string> {
  return nl
    ? {
        REASON_REQUIRED: "Niet gesloten: schrijf een reden. De indiener ziet die bij de aanvraag.",
        REASON_TOO_LONG: `Niet gesloten: de reden mag hoogstens ${PAL_PLUS_LIMITS.reviewNote} tekens zijn.`,
        NOT_ACTIVE: "Niet gesloten: de aanvraag is ondertussen al afgehandeld of ingetrokken. Herlaad de pagina.",
        NOT_CLOSED: "Niet heropend: enkel een gesloten aanvraag kan terug open.",
        COURSE_UNKNOWN: "Niet opgeslagen: dat vak bestaat niet meer. Herlaad de pagina.",
        NOT_PUBLISHABLE: "Niet online gezet: de vraag is ondertussen al nagekeken, gesloten of ingetrokken. Herlaad de pagina.",
      }
    : {
        REASON_REQUIRED: "Not closed: write a reason. The submitter sees it with the request.",
        REASON_TOO_LONG: `Not closed: the reason can be at most ${PAL_PLUS_LIMITS.reviewNote} characters.`,
        NOT_ACTIVE: "Not closed: the request was handled or withdrawn in the meantime. Reload the page.",
        NOT_CLOSED: "Not reopened: only a closed request can be reopened.",
        COURSE_UNKNOWN: "Not saved: that course no longer exists. Reload the page.",
        NOT_PUBLISHABLE: "Not published: the request was reviewed, closed or withdrawn in the meantime. Reload the page.",
      };
}

export type PalPlusSessionAdminErrorCode =
  | PalPlusSessionErrorCode
  | "CANCEL_REASON_REQUIRED"
  | "CANCEL_REASON_TOO_LONG"
  | "TUTOR_HAS_PAID"
  | "REWARD_CONFLICT"
  | "AMOUNT_INVALID"
  | "NOTE_REQUIRED"
  | "NOTE_TOO_LONG"
  | "TUTOR_GONE";

export function palPlusSessionErrors(nl: boolean): Record<PalPlusSessionAdminErrorCode, string> {
  const hours = PAL_PLUS_MAX_SESSION_MINUTES / 60;
  return nl
    ? {
        COURSE_REQUIRED: "Niet opgeslagen: kies een vak uit de lijst.",
        COURSE_UNKNOWN: "Niet opgeslagen: dat vak bestaat niet meer. Herlaad de pagina.",
        DESCRIPTION_TOO_LONG: `Niet opgeslagen: de omschrijving mag hoogstens ${PAL_PLUS_LIMITS.description} tekens zijn.`,
        MOMENT_REQUIRED: "Niet opgeslagen: kies een datum, een beginuur en een einduur.",
        MOMENT_INVALID: "Niet opgeslagen: die datum of dat uur bestaat niet.",
        MOMENT_ORDER: "Niet opgeslagen: het einduur moet na het beginuur liggen.",
        MOMENT_TOO_LONG: `Niet opgeslagen: een sessie duurt hoogstens ${hours} uur. Klopt het einduur?`,
        MAX_INVALID: `Niet opgeslagen: het maximum is een geheel getal tussen 1 en ${PAL_PLUS_LIMITS.maxParticipants}, of leeg voor geen maximum.`,
        MAX_BELOW_SIGNUPS: "Niet opgeslagen: er zijn al meer mensen ingeschreven dan dat maximum. Zet het hoger, of laat het leeg.",
        ROOM_TEXT_TOO_LONG: `Niet opgeslagen: het lokaal mag hoogstens ${PAL_PLUS_LIMITS.roomText} tekens zijn.`,
        ROOM_UNKNOWN: "Niet opgeslagen: dat lokaal staat niet meer in de lijst. Herlaad de pagina.",
        TUTOR_REQUIRED: "Niet opgeslagen: een sessie heeft minstens één tutor.",
        TUTORS_TOO_MANY: `Niet opgeslagen: hoogstens ${PAL_PLUS_LIMITS.tutors} tutors per sessie.`,
        TUTOR_UNKNOWN: "Niet opgeslagen: een van de tutors bestaat niet meer. Kies opnieuw.",
        TAG_TOO_LONG: `Niet opgeslagen: een tag mag hoogstens ${PAL_PLUS_LIMITS.tag} tekens zijn.`,
        TOO_MANY_TAGS: `Niet opgeslagen: hoogstens ${PAL_PLUS_LIMITS.tags} tags per sessie.`,
        TUTOR_HAS_PAID:
          "Niet opgeslagen: een tutor die je weghaalt, heeft de bonnetjes van deze sessie al uitgegeven. Corrigeer eerst de beloning.",
        SESSION_GONE: "Die sessie bestaat niet meer. Herlaad de pagina.",
        SESSION_CANCELLED: "Niet opgeslagen: deze sessie is geannuleerd.",
        CANCEL_REASON_REQUIRED: "Niet geannuleerd: schrijf een reden. Wie ingeschreven is, ziet die.",
        CANCEL_REASON_TOO_LONG: `Niet geannuleerd: de reden mag hoogstens ${PAL_PLUS_LIMITS.cancelReason} tekens zijn.`,
        REWARD_CONFLICT:
          "Niet opgeslagen: het bonnetjessaldo van een tutor veranderde net (iemand betaalde ermee). Probeer het opnieuw.",
        AMOUNT_INVALID: `Niet opgeslagen: een beloning is een veelvoud van een half bonnetje, van 0 tot ${PAL_PLUS_MAX_REWARD}.`,
        NOTE_REQUIRED: "Niet opgeslagen: schrijf waarom je de beloning aanpast. Dat staat in het logboek.",
        NOTE_TOO_LONG: `Niet opgeslagen: de uitleg mag hoogstens ${PAL_PLUS_LIMITS.reviewNote} tekens zijn.`,
        TUTOR_GONE: "Niet opgeslagen: die tutor staat niet meer op de sessie. Herlaad de pagina.",
      }
    : {
        COURSE_REQUIRED: "Not saved: pick a course from the list.",
        COURSE_UNKNOWN: "Not saved: that course no longer exists. Reload the page.",
        DESCRIPTION_TOO_LONG: `Not saved: the description can be at most ${PAL_PLUS_LIMITS.description} characters.`,
        MOMENT_REQUIRED: "Not saved: pick a date, a start time and an end time.",
        MOMENT_INVALID: "Not saved: that date or time does not exist.",
        MOMENT_ORDER: "Not saved: the end time has to be after the start time.",
        MOMENT_TOO_LONG: `Not saved: a session lasts at most ${hours} hours. Is the end time right?`,
        MAX_INVALID: `Not saved: the maximum is a whole number between 1 and ${PAL_PLUS_LIMITS.maxParticipants}, or empty for no maximum.`,
        MAX_BELOW_SIGNUPS: "Not saved: more people have already signed up than that maximum. Raise it, or leave it empty.",
        ROOM_TEXT_TOO_LONG: `Not saved: the room can be at most ${PAL_PLUS_LIMITS.roomText} characters.`,
        ROOM_UNKNOWN: "Not saved: that room is no longer on the list. Reload the page.",
        TUTOR_REQUIRED: "Not saved: a session needs at least one tutor.",
        TUTORS_TOO_MANY: `Not saved: at most ${PAL_PLUS_LIMITS.tutors} tutors per session.`,
        TUTOR_UNKNOWN: "Not saved: one of the tutors no longer exists. Pick again.",
        TAG_TOO_LONG: `Not saved: a tag can be at most ${PAL_PLUS_LIMITS.tag} characters.`,
        TOO_MANY_TAGS: `Not saved: at most ${PAL_PLUS_LIMITS.tags} tags per session.`,
        TUTOR_HAS_PAID:
          "Not saved: a tutor you are removing already spent the vouchers for this session. Correct the reward first.",
        SESSION_GONE: "That session no longer exists. Reload the page.",
        SESSION_CANCELLED: "Not saved: this session was cancelled.",
        CANCEL_REASON_REQUIRED: "Not cancelled: write a reason. Everyone who signed up sees it.",
        CANCEL_REASON_TOO_LONG: `Not cancelled: the reason can be at most ${PAL_PLUS_LIMITS.cancelReason} characters.`,
        REWARD_CONFLICT:
          "Not saved: a tutor's voucher balance just changed (someone paid with it). Please try again.",
        AMOUNT_INVALID: `Not saved: a reward is a multiple of half a voucher, from 0 to ${PAL_PLUS_MAX_REWARD}.`,
        NOTE_REQUIRED: "Not saved: write why you are changing the reward. It goes in the audit log.",
        NOTE_TOO_LONG: `Not saved: the explanation can be at most ${PAL_PLUS_LIMITS.reviewNote} characters.`,
        TUTOR_GONE: "Not saved: that tutor is no longer on the session. Reload the page.",
      };
}

/** De snelle tags en de dagdelen in het beheer. */
export type PalPlusListErrorCode = "TAG_REQUIRED" | "TAG_TOO_LONG" | "TAG_TAKEN" | PalPlusDaypartErrorCode;

export function palPlusListErrors(nl: boolean): Record<PalPlusListErrorCode, string> {
  return nl
    ? {
        TAG_REQUIRED: "Niet opgeslagen: geef de tag een naam.",
        TAG_TOO_LONG: `Niet opgeslagen: een tag mag hoogstens ${PAL_PLUS_LIMITS.tag} tekens zijn.`,
        TAG_TAKEN: "Niet opgeslagen: die tag staat al in de lijst.",
        DAYPART_LABEL_REQUIRED: "Niet opgeslagen: geef het dagdeel een naam.",
        DAYPART_LABEL_TOO_LONG: `Niet opgeslagen: de naam mag hoogstens ${PAL_PLUS_LIMITS.daypartLabel} tekens zijn.`,
        DAYPART_TIME_INVALID: "Niet opgeslagen: vul een begin- en einduur in, zoals 18:00.",
        DAYPART_TIME_ORDER: "Niet opgeslagen: het einduur moet na het beginuur liggen, op dezelfde dag.",
      }
    : {
        TAG_REQUIRED: "Not saved: give the tag a name.",
        TAG_TOO_LONG: `Not saved: a tag can be at most ${PAL_PLUS_LIMITS.tag} characters.`,
        TAG_TAKEN: "Not saved: that tag is already on the list.",
        DAYPART_LABEL_REQUIRED: "Not saved: give the part of the day a name.",
        DAYPART_LABEL_TOO_LONG: `Not saved: the name can be at most ${PAL_PLUS_LIMITS.daypartLabel} characters.`,
        DAYPART_TIME_INVALID: "Not saved: fill in a start and end time, like 18:00.",
        DAYPART_TIME_ORDER: "Not saved: the end time has to be after the start time, on the same day.",
      };
}
