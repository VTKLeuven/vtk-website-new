import { PAL_PLUS_LIMITS, type PalPlusCourseErrorCode } from "@/lib/palPlus";

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
