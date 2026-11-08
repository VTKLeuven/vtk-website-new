/**
 * De regels van een POC-peiling, zonder database en zonder React: wanneer ze
 * open is, voor wie ze is en wat er uit een ingestuurd formulier geldig is.
 *
 * De kringkeuzes staan in docs/design-decisions.md, "POC-peilingen".
 */

/** Dezelfde waarden als de enum `PocPollQuestionKind` in Prisma. */
export type PollQuestionKind = "YES_NO" | "SCORE" | "OPEN";

/** Ruim genoeg voor een alinea, en past in een pop-up op Discord. */
export const MAX_OPEN_ANSWER_LENGTH = 2000;

export const POLL_YES = 1;
export const POLL_NO = 0;
export const POLL_SCORES = [1, 2, 3, 4, 5] as const;

export type PollAnswerRow = {
  questionId: string;
  value: number | null;
  text: string | null;
};

export type OpenPocPollQuestion = {
  id: string;
  kind: PollQuestionKind;
  textNl: string;
  textEn: string | null;
  lowLabelNl: string | null;
  lowLabelEn: string | null;
  highLabelNl: string | null;
  highLabelEn: string | null;
};

/**
 * Een peiling zoals de gedeelde cache ze bewaart. Enkel strings: een `Date` komt
 * uit `unstable_cache` als string terug, terwijl het type nog `Date` zou zeggen.
 */
export type OpenPocPoll = {
  id: string;
  pocId: string;
  titleNl: string;
  titleEn: string | null;
  /** `yyyy-mm-dd`, of null wanneer de RiVers geen vergadering opgaven. */
  meetingDate: string | null;
  opensAt: string;
  closesAt: string;
  programmes: string[];
  /** Leeg: alle fases van de richting. */
  studyYears: string[];
  /** De eerste drie RiVers, voor de gezichten in de strook. */
  faces: Array<{ name: string; avatarKey: string | null }>;
  questions: OpenPocPollQuestion[];
};

/** Wat de RiVers na de POC vertellen, zoals de gedeelde cache het bewaart. */
export type PocPollSummary = {
  id: string;
  pocId: string;
  titleNl: string;
  titleEn: string | null;
  summary: string;
  voters: number;
};

/** Dezelfde peiling, samen met wat deze bezoeker er zelf op antwoordde. */
export type ViewerPocPoll = OpenPocPoll & {
  answered: boolean;
  answers: Record<string, { value: number | null; text: string | null }>;
};

export type ParsedPollAnswers =
  | { ok: true; answers: PollAnswerRow[] }
  | { ok: false; code: "POLL_INVALID" | "POLL_TOO_LONG" };

/** De naam van het formulierveld van een vraag. */
export function pollFieldName(questionId: string): string {
  return `vraag_${questionId}`;
}

/** Open vanaf `opensAt`, tot net voor `closesAt`. Aanvaardt ook datums uit de cache. */
export function pollIsOpen(
  poll: { opensAt: Date | string; closesAt: Date | string },
  now: Date,
): boolean {
  return new Date(poll.opensAt) <= now && now < new Date(poll.closesAt);
}

/** Een peiling is voor wie een richting met haar POC deelt en in een gekozen fase zit. */
export function pollIsForViewer(
  poll: { programmes: readonly string[]; studyYears: readonly string[] },
  viewer: { programmes: readonly string[]; years: readonly string[] },
): boolean {
  if (!poll.programmes.some((programme) => viewer.programmes.includes(programme))) return false;
  return poll.studyYears.length === 0 || poll.studyYears.some((year) => viewer.years.includes(year));
}

export type PollStatus = "DRAFT" | "OPEN" | "CLOSED";

export function pollStatus(
  poll: { publishedAt: Date | string | null; opensAt: Date | string; closesAt: Date | string },
  now: Date,
): PollStatus {
  if (!poll.publishedAt) return "DRAFT";
  return pollIsOpen(poll, now) ? "OPEN" : "CLOSED";
}

/**
 * Leest de antwoorden uit een formulier. Een vraag zonder antwoord is geen fout
 * maar valt weg: wie geen mening heeft, mag een vraag overslaan. Een waarde die
 * het formulier zelf nooit kan sturen, is wel een fout.
 */
export function parsePollAnswers(
  questions: ReadonlyArray<{ id: string; kind: PollQuestionKind }>,
  read: (fieldName: string) => unknown,
): ParsedPollAnswers {
  const answers: PollAnswerRow[] = [];

  for (const question of questions) {
    const raw = read(pollFieldName(question.id));
    if (typeof raw !== "string" || raw.trim() === "") continue;

    if (question.kind === "OPEN") {
      // Een textarea verstuurt CRLF; zonder dit telt elke nieuwe regel dubbel.
      const text = raw.replace(/\r\n/g, "\n").trim();
      if (text.length > MAX_OPEN_ANSWER_LENGTH) return { ok: false, code: "POLL_TOO_LONG" };
      answers.push({ questionId: question.id, value: null, text });
      continue;
    }

    const value = Number(raw);
    const valid =
      question.kind === "YES_NO"
        ? value === POLL_YES || value === POLL_NO
        : (POLL_SCORES as readonly number[]).includes(value);
    if (!valid) return { ok: false, code: "POLL_INVALID" };
    answers.push({ questionId: question.id, value, text: null });
  }

  return { ok: true, answers };
}

/** Twee letters voor wie geen foto heeft. */
export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
