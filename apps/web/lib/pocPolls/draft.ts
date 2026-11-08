import { brusselsMinutesOfDay, brusselsWallClock, brusselsYMD, parseYMD, ymdKey } from "@/lib/brussels";
import type { PollQuestionKind } from "./core";

/**
 * Wat een RiVer invult in het opstelscherm, nagekeken. Puur, zodat de regels
 * zonder database te testen zijn. Een concept mag onaf zijn, publiceren niet.
 */

export const MAX_POLL_QUESTIONS = 5;
const MAX_TITLE = 120;
const MAX_QUESTION = 200;
const MAX_SCALE_LABEL = 40;

const KINDS: readonly PollQuestionKind[] = ["YES_NO", "SCORE", "OPEN"];

export type PollDraftQuestion = {
  kind: PollQuestionKind;
  text: string;
  low: string | null;
  high: string | null;
};

export type PollDraft = {
  title: string;
  closesAt: Date;
  meetingDate: Date | null;
  questions: PollDraftQuestion[];
  studyYears: string[];
  discordChannelId: string | null;
};

export type ParsedPollDraft = { ok: true; draft: PollDraft } | { ok: false; code: string };

/** "YYYY-MM-DDTHH:mm" op de Brusselse klok, voor een datetime-local-veld. */
export function toBrusselsInput(date: Date): string {
  const minutes = brusselsMinutesOfDay(date);
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${ymdKey(brusselsYMD(date))}T${hhmm}`;
}

/** Standaard twee weken: lang genoeg om iedereen te bereiken, kort genoeg voor de POC. */
export function defaultPollCloseInput(): string {
  return toBrusselsInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
}

export function parseBrusselsInput(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value.trim());
  if (!match) return null;
  const ymd = parseYMD(match[1]);
  if (!ymd) return null;
  return brusselsWallClock(ymd.year, ymd.month, ymd.day, match[2]);
}

function readQuestions(raw: string): PollDraftQuestion[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const questions: PollDraftQuestion[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const { kind, text, low, high } = entry as Record<string, unknown>;
    if (!KINDS.includes(kind as PollQuestionKind) || typeof text !== "string") return null;
    const isScore = kind === "SCORE";
    questions.push({
      kind: kind as PollQuestionKind,
      text: text.trim(),
      low: isScore && typeof low === "string" && low.trim() ? low.trim() : null,
      high: isScore && typeof high === "string" && high.trim() ? high.trim() : null,
    });
  }
  return questions;
}

export function parsePollDraft(
  input: {
    title: string;
    closesAt: string;
    meetingDate: string;
    questions: string;
    studyYears: string[];
    discordChannelId: string;
  },
  options: { publish: boolean; now: Date },
): ParsedPollDraft {
  const title = input.title.trim();
  if (!title || title.length > MAX_TITLE) return { ok: false, code: "POLL_TITLE" };

  const closesAt = parseBrusselsInput(input.closesAt);
  if (!closesAt) return { ok: false, code: "POLL_CLOSES_INVALID" };
  if (options.publish && closesAt <= options.now) return { ok: false, code: "POLL_CLOSES_PAST" };

  let meetingDate: Date | null = null;
  if (input.meetingDate.trim()) {
    if (!parseYMD(input.meetingDate.trim())) return { ok: false, code: "POLL_MEETING_INVALID" };
    meetingDate = new Date(`${input.meetingDate.trim()}T00:00:00.000Z`);
  }

  const all = readQuestions(input.questions);
  if (!all) return { ok: false, code: "POLL_QUESTIONS_INVALID" };
  if (all.length > MAX_POLL_QUESTIONS) return { ok: false, code: "POLL_TOO_MANY" };
  if (options.publish && all.length === 0) return { ok: false, code: "POLL_NO_QUESTIONS" };
  if (options.publish && all.some((question) => !question.text)) return { ok: false, code: "POLL_QUESTION_EMPTY" };

  const questions = all.filter((question) => question.text);
  if (questions.some((question) => question.text.length > MAX_QUESTION)) return { ok: false, code: "POLL_QUESTION_LONG" };
  if (questions.some((question) => (question.low?.length ?? 0) > MAX_SCALE_LABEL || (question.high?.length ?? 0) > MAX_SCALE_LABEL)) {
    return { ok: false, code: "POLL_QUESTION_LONG" };
  }

  return {
    ok: true,
    draft: {
      title,
      closesAt,
      meetingDate,
      questions,
      studyYears: input.studyYears,
      discordChannelId: input.discordChannelId.trim() || null,
    },
  };
}
