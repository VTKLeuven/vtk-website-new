import type { Locale } from "@vtk/i18n";
import { brusselsYMD, parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import type { PollQuestionKind, ViewerPocPoll } from "./core";
import type { PollStripKind } from "./strip";

/**
 * De teksten van een POC-peiling. Eén plek, zodat de echte strook en de
 * voorvertoning op /admin/it/flows nooit uit elkaar lopen.
 */

const BRUSSELS = "Europe/Brussels";

/** Zoals `pick` uit `@vtk/i18n`, maar dit bestand komt ook in clientcode terecht. */
function inLocale(nl: string, en: string | null, locale: Locale): string {
  return locale === "en" && en ? en : nl;
}

/** De fases zoals de RiVers en de resultaten ze noemen. */
export function pollPhaseLabel(year: string, locale: Locale): string {
  const labels: Record<string, [string, string]> = {
    BACHELOR_1: ["1e bachelor", "1st bachelor"],
    BACHELOR_2: ["2e bachelor", "2nd bachelor"],
    BACHELOR_3: ["3e bachelor", "3rd bachelor"],
    MASTER_1: ["1e master", "1st master"],
    MASTER_2: ["2e master", "2nd master"],
  };
  const label = labels[year];
  return label ? label[locale === "nl" ? 0 : 1] : year;
}

/** `yyyy-mm-dd` als moment op de middag, zodat de dag in elke tijdzone klopt. */
function noonOf(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function localeTag(locale: Locale): string {
  return locale === "nl" ? "nl-BE" : "en-GB";
}

function meetingIsAhead(meetingDate: string | null, now: Date): meetingDate is string {
  if (!meetingDate || !parseYMD(meetingDate)) return false;
  return meetingDate >= ymdKey(brusselsYMD(now));
}

export type PollStripCopy = {
  text: string;
  strong: string;
  /** Rechts in de strook, op de homepage. */
  action: string;
  /** Op een andere pagina, waar de pijl terug naar de homepage wijst. */
  actionAway: string;
};

function pollCopy(input: {
  locale: Locale;
  questionCount: number;
  meetingDate: string | null;
  closesAt: string;
  now: Date;
  general: boolean;
}): PollStripCopy {
  const { locale, questionCount, meetingDate, closesAt, now, general } = input;
  const nl = locale === "nl";
  const closes = new Date(closesAt);
  const today = brusselsYMD(now);
  const closesKey = ymdKey(brusselsYMD(closes));
  const action = nl
    ? questionCount === 1
      ? "1 korte vraag"
      : `${questionCount} korte vragen`
    : questionCount === 1
      ? "1 short question"
      : `${questionCount} short questions`;
  const actionAway = nl ? "Naar de vragen" : "To the questions";

  // De laatste twee dagen is de deadline het verhaal, niet de vergadering.
  if (closesKey <= ymdKey(shiftYMD(today, 1))) {
    const weekday = closes.toLocaleDateString(localeTag(locale), {
      weekday: "long",
      timeZone: BRUSSELS,
    });
    const lastDay = closesKey === ymdKey(today);
    if (general) {
      return {
        text: nl
          ? lastDay
            ? "Vandaag verzamelt VTK Onderwijs de laatste meningen van alle richtingen."
            : `Nog tot ${weekday} verzamelt VTK Onderwijs meningen van alle richtingen.`
          : lastDay
            ? "Today is the last day VTK Onderwijs collects opinions from all programmes."
            : `Until ${weekday} VTK Onderwijs is collecting opinions from all programmes.`,
        strong: nl ? "Doe je mee?" : "Will you join in?",
        action,
        actionAway,
      };
    }
    return {
      text: nl
        ? lastDay
          ? "Vandaag verzamelen je RiVers de laatste meningen voor de POC."
          : `Nog tot ${weekday} verzamelen je RiVers meningen voor de POC.`
        : lastDay
          ? "Today is the last day your student reps collect opinions for the POC."
          : `Until ${weekday} your student reps are collecting opinions for the POC.`,
      strong: nl ? "Doe je mee?" : "Will you join in?",
      action,
      actionAway,
    };
  }

  if (meetingIsAhead(meetingDate, now)) {
    const date = noonOf(meetingDate).toLocaleDateString(localeTag(locale), {
      day: "numeric",
      month: "long",
      timeZone: BRUSSELS,
    });
    if (general) {
      return {
        text: nl
          ? `Op ${date} neemt VTK Onderwijs de mening van alle richtingen mee naar de vergadering.`
          : `On ${date} VTK Onderwijs brings the opinion of all programmes to the meeting.`,
        strong: nl ? "Er staan een paar vraagjes voor je klaar." : "A few questions are waiting for you.",
        action,
        actionAway,
      };
    }
    return {
      text: nl
        ? `Op ${date} zitten je RiVers met je proffen rond de tafel op de POC.`
        : `On ${date} your student reps sit down with your professors at the POC.`,
      strong: nl ? "Ze hebben een paar vraagjes voor jullie." : "They have a few questions for you.",
      action,
      actionAway,
    };
  }

  if (general) {
    return {
      text: nl
        ? "VTK Onderwijs vraagt de mening van alle richtingen."
        : "VTK Onderwijs wants the opinion of all programmes.",
      strong: nl ? "Er staan een paar vraagjes voor je klaar." : "A few questions are waiting for you.",
      action,
      actionAway,
    };
  }
  return {
    text: nl
      ? "Je RiVers vragen je mening voor de POC."
      : "Your student reps want your opinion for the POC.",
    strong: nl ? "Ze hebben een paar vraagjes voor jullie." : "They have a few questions for you.",
    action,
    actionAway,
  };
}

export function pollStripCopy(
  kind: PollStripKind,
  input: {
    locale: Locale;
    questionCount?: number;
    meetingDate?: string | null;
    closesAt?: string;
    now: Date;
    /** Een algemene peiling van VTK Onderwijs in plaats van een van je RiVers. */
    general?: boolean;
  },
): PollStripCopy {
  const { locale, now } = input;
  const nl = locale === "nl";

  if (kind === "signIn") {
    const action = nl ? "Aanmelden" : "Sign in";
    return {
      text: nl
        ? "Je RiVers vragen je mening voor de POC."
        : "Your student reps want your opinion for the POC.",
      strong: nl ? "Meld je aan om mee te doen." : "Sign in to take part.",
      action,
      actionAway: action,
    };
  }

  if (kind === "noProgramme") {
    const action = nl ? "Richting instellen" : "Set programme";
    return {
      text: nl
        ? "Je POC kan je niets vragen zolang we je richting niet kennen."
        : "Your POC can't ask you anything until we know your programme.",
      strong: nl ? "Stel ze in." : "Set it now.",
      action,
      actionAway: action,
    };
  }

  return pollCopy({
    locale,
    questionCount: input.questionCount ?? 0,
    meetingDate: input.meetingDate ?? null,
    closesAt: input.closesAt ?? now.toISOString(),
    now,
    general: input.general ?? false,
  });
}

/** De regels rond de vragen van één peiling. */
export function pollPanelText(input: {
  locale: Locale;
  meetingDate: string | null;
  closesAt: string;
  now: Date;
  general?: boolean;
}): { openUntil: string; lead: string; thanks: string; anonymous: string } {
  const { locale, meetingDate, closesAt, now, general = false } = input;
  const nl = locale === "nl";
  const closes = new Date(closesAt).toLocaleDateString(localeTag(locale), {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: BRUSSELS,
  });
  const openUntil = nl ? `Open tot ${closes}` : `Open until ${closes}`;

  if (general) {
    const anonymous = nl
      ? "Anoniem. VTK Onderwijs ziet enkel totalen en niemand ziet een tussenstand."
      : "Anonymous. VTK Onderwijs only sees totals and nobody sees interim results.";
    const thanks = nl
      ? "Je ziet bewust geen tussenstand. VTK Onderwijs ziet enkel de totalen van alle richtingen."
      : "You deliberately see no interim results. VTK Onderwijs only sees the totals of all programmes.";
    if (meetingIsAhead(meetingDate, now)) {
      const long = noonOf(meetingDate).toLocaleDateString(localeTag(locale), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: BRUSSELS,
      });
      return {
        openUntil,
        lead: nl
          ? `Op ${long} neemt VTK Onderwijs dit mee naar de vergadering, voor alle richtingen samen.`
          : `On ${long} VTK Onderwijs brings this to the meeting, for all programmes together.`,
        thanks,
        anonymous,
      };
    }
    return {
      openUntil,
      lead: nl
        ? "VTK Onderwijs vraagt dit aan de studenten van alle richtingen."
        : "VTK Onderwijs asks this of the students of all programmes.",
      thanks,
      anonymous,
    };
  }

  const anonymous = nl
    ? "Anoniem. Je RiVers zien enkel totalen en niemand ziet een tussenstand."
    : "Anonymous. Your student reps only see totals and nobody sees interim results.";

  if (meetingIsAhead(meetingDate, now)) {
    const noon = noonOf(meetingDate);
    const long = noon.toLocaleDateString(localeTag(locale), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: BRUSSELS,
    });
    const short = noon.toLocaleDateString(localeTag(locale), {
      day: "numeric",
      month: "long",
      timeZone: BRUSSELS,
    });
    return {
      openUntil,
      lead: nl
        ? `Op ${long} zitten je RiVers met je proffen rond de tafel. Dit nemen ze mee.`
        : `On ${long} your student reps sit down with your professors. This is what they bring.`,
      thanks: nl
        ? `Je ziet bewust geen tussenstand. Op ${short} nemen je RiVers de totalen mee naar je proffen.`
        : `You deliberately see no interim results. On ${short} your student reps bring the totals to your professors.`,
      anonymous,
    };
  }

  return {
    openUntil,
    lead: nl
      ? "Je RiVers nemen dit mee naar de POC, waar ze het aan je proffen voorleggen."
      : "Your student reps bring this to the POC and put it to your professors.",
    thanks: nl
      ? "Je ziet bewust geen tussenstand. Je RiVers nemen de totalen mee naar de POC."
      : "You deliberately see no interim results. Your student reps bring the totals to the POC.",
    anonymous,
  };
}

/** Alles wat het invulpaneel van één peiling nodig heeft, al in de juiste taal. */
export type PollPanelData = {
  id: string;
  title: string;
  openUntil: string;
  lead: string;
  thanks: string;
  /** Wie de totalen ziet, onder de verstuurknop. */
  anonymous: string;
  answered: boolean;
  questions: Array<{
    id: string;
    kind: PollQuestionKind;
    text: string;
    low: string | null;
    high: string | null;
  }>;
  answers: ViewerPocPoll["answers"];
};

export function pollPanelData(poll: ViewerPocPoll, locale: Locale, now: Date): PollPanelData {
  return {
    id: poll.id,
    title: inLocale(poll.titleNl, poll.titleEn, locale),
    ...pollPanelText({ locale, meetingDate: poll.meetingDate, closesAt: poll.closesAt, now, general: poll.pocId === null }),
    answered: poll.answered,
    questions: poll.questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      text: inLocale(question.textNl, question.textEn, locale),
      low: question.lowLabelNl ? inLocale(question.lowLabelNl, question.lowLabelEn, locale) : null,
      high: question.highLabelNl ? inLocale(question.highLabelNl, question.highLabelEn, locale) : null,
    })),
    answers: poll.answers,
  };
}

export type PollPanelLabels = {
  yes: string;
  no: string;
  optional: string;
  placeholder: string;
  defaultLow: string;
  defaultHigh: string;
  submit: string;
  submitting: string;
  saved: string;
  thanksTitle: string;
  edit: string;
  fallbackError: string;
  errors: Record<string, string>;
};

export function pollPanelLabels(locale: Locale): PollPanelLabels {
  return locale === "nl"
    ? {
        yes: "Ja",
        no: "Nee",
        optional: "Optioneel",
        placeholder: "Typ hier je antwoord",
        defaultLow: "Oneens",
        defaultHigh: "Eens",
        submit: "Verstuur mijn antwoorden",
        submitting: "Bezig met versturen...",
        saved: "Je antwoorden zijn genoteerd.",
        thanksTitle: "Bedankt, je antwoorden zijn genoteerd.",
        edit: "Wijzig mijn antwoorden",
        fallbackError: "Niet verstuurd: er ging iets mis. Probeer het opnieuw.",
        errors: {
          POLL_SIGN_IN: "Niet verstuurd: je bent niet meer aangemeld. Meld je opnieuw aan.",
          POLL_CLOSED: "Niet verstuurd: deze peiling is intussen gesloten.",
          POLL_NOT_YOURS: "Niet verstuurd: deze peiling is voor een andere richting.",
          POLL_EMPTY: "Niet verstuurd: je hebt nog niets ingevuld.",
          POLL_INVALID: "Niet verstuurd: een van je antwoorden klopt niet. Vernieuw de pagina.",
          POLL_TOO_LONG: "Niet verstuurd: je antwoord op de open vraag is te lang.",
        },
      }
    : {
        yes: "Yes",
        no: "No",
        optional: "Optional",
        placeholder: "Type your answer here",
        defaultLow: "Disagree",
        defaultHigh: "Agree",
        submit: "Send my answers",
        submitting: "Sending...",
        saved: "Your answers have been recorded.",
        thanksTitle: "Thanks, your answers have been recorded.",
        edit: "Change my answers",
        fallbackError: "Not sent: something went wrong. Please try again.",
        errors: {
          POLL_SIGN_IN: "Not sent: you are no longer signed in. Please sign in again.",
          POLL_CLOSED: "Not sent: this poll has closed in the meantime.",
          POLL_NOT_YOURS: "Not sent: this poll is for another programme.",
          POLL_EMPTY: "Not sent: you have not answered anything yet.",
          POLL_INVALID: "Not sent: one of your answers is not valid. Please refresh the page.",
          POLL_TOO_LONG: "Not sent: your answer to the open question is too long.",
        },
      };
}
