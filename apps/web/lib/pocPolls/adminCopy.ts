/** De foutmeldingen van het beheer van peilingen. */
export function pollAdminErrors(nl: boolean): Record<string, string> {
  return nl
    ? {
        POLL_TITLE: "Niet opgeslagen: geef de peiling een titel van hoogstens 120 tekens.",
        POLL_CLOSES_INVALID: "Niet opgeslagen: kies wanneer de peiling sluit.",
        POLL_CLOSES_PAST: "Niet gepubliceerd: de sluitdatum ligt in het verleden.",
        POLL_MEETING_INVALID: "Niet opgeslagen: dat is geen geldige datum voor de POC.",
        POLL_QUESTIONS_INVALID: "Niet opgeslagen: de vragen konden niet gelezen worden. Vernieuw de pagina.",
        POLL_TOO_MANY: "Niet opgeslagen: een peiling heeft hoogstens 5 vragen.",
        POLL_NO_QUESTIONS: "Niet gepubliceerd: voeg minstens één vraag toe.",
        POLL_QUESTION_EMPTY: "Niet gepubliceerd: een van de vragen is nog leeg.",
        POLL_QUESTION_LONG: "Niet opgeslagen: een vraag of een label is te lang.",
        POLL_FORBIDDEN: "Niet opgeslagen: je beheert de peilingen van deze POC niet.",
        POLL_LOCKED: "Niet opgeslagen: deze peiling is al gepubliceerd.",
        POLL_POC_NO_PROGRAMME: "Niet gepubliceerd: deze POC hangt nog aan geen richting. Vraag VTK Onderwijs dat in te stellen.",
        POLL_STILL_OPEN: "Niet gepubliceerd: de peiling staat nog open.",
        POLL_SUMMARY_LONG: "Niet gepubliceerd: de samenvatting is te lang.",
      }
    : {
        POLL_TITLE: "Not saved: give the poll a title of at most 120 characters.",
        POLL_CLOSES_INVALID: "Not saved: choose when the poll closes.",
        POLL_CLOSES_PAST: "Not published: the closing date is in the past.",
        POLL_MEETING_INVALID: "Not saved: that is not a valid date for the POC.",
        POLL_QUESTIONS_INVALID: "Not saved: the questions could not be read. Please refresh the page.",
        POLL_TOO_MANY: "Not saved: a poll has at most 5 questions.",
        POLL_NO_QUESTIONS: "Not published: add at least one question.",
        POLL_QUESTION_EMPTY: "Not published: one of the questions is still empty.",
        POLL_QUESTION_LONG: "Not saved: a question or label is too long.",
        POLL_FORBIDDEN: "Not saved: you do not manage the polls of this POC.",
        POLL_LOCKED: "Not saved: this poll has already been published.",
        POLL_POC_NO_PROGRAMME: "Not published: this POC is not linked to a programme yet. Ask VTK Onderwijs to set that up.",
        POLL_STILL_OPEN: "Not published: the poll is still open.",
        POLL_SUMMARY_LONG: "Not published: the summary is too long.",
      };
}
