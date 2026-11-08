import type { PollQuestionKind } from "./core";
import { POLL_NO, POLL_SCORES, POLL_YES } from "./core";

/**
 * De resultaten van een peiling, puur uit de antwoorden gerekend.
 *
 * Een fase met minder dan {@link MIN_GROUP_SIZE} antwoorden wordt nooit apart
 * getoond: in een groep van drie is een antwoord herleidbaar tot een persoon.
 */
export const MIN_GROUP_SIZE = 5;

export type ResultRow = {
  questionId: string;
  voterKey: string;
  value: number | null;
  text: string | null;
  studyYears: string[];
};

export type PhaseTurnout = {
  year: string;
  answered: number;
  population: number;
  share: number;
  tooFew: boolean;
};

export type PollTurnout = {
  answered: number;
  population: number;
  share: number;
  phases: PhaseTurnout[];
};

/**
 * Hoogstens 100: wie antwoordde, kan intussen van richting veranderd zijn of zijn
 * studie niet bevestigd hebben, en telt dan wel als antwoord maar niet als bereik.
 */
function share(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

/** Eén rij per student: een student telt één keer, hoeveel vragen hij ook invulde. */
function voters(rows: readonly ResultRow[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const row of rows) byKey.set(row.voterKey, row.studyYears);
  return byKey;
}

export function computeTurnout(
  rows: readonly ResultRow[],
  population: { total: number; perYear: Record<string, number> },
): PollTurnout {
  const all = [...voters(rows).values()];
  const phases = Object.entries(population.perYear)
    .filter(([, count]) => count > 0)
    .map(([year, count]) => {
      const answered = all.filter((years) => years.includes(year)).length;
      return { year, answered, population: count, share: share(answered, count), tooFew: answered < MIN_GROUP_SIZE };
    });
  return { answered: all.length, population: population.total, share: share(all.length, population.total), phases };
}

/** Enkel de antwoorden van wie in deze fase zit; `null` is iedereen. */
export function rowsForPhase<Row extends { studyYears: string[] }>(rows: readonly Row[], year: string | null): Row[] {
  return year ? rows.filter((row) => row.studyYears.includes(year)) : [...rows];
}

export type ResultBar = { value: number; count: number; share: number };

export type QuestionResult = {
  answered: number;
  bars: ResultBar[];
  /** Enkel bij een score. */
  average: number | null;
};

export function questionResult(kind: PollQuestionKind, rows: readonly Pick<ResultRow, "value" | "text">[]): QuestionResult {
  if (kind === "OPEN") {
    return { answered: rows.filter((row) => row.text).length, bars: [], average: null };
  }
  const values: readonly number[] = kind === "YES_NO" ? [POLL_YES, POLL_NO] : POLL_SCORES;
  const answered = rows.filter((row) => row.value !== null).length;
  const bars = values.map((value) => {
    const count = rows.filter((row) => row.value === value).length;
    return { value, count, share: share(count, answered) };
  });
  const average =
    kind === "SCORE" && answered > 0
      ? rows.reduce((sum, row) => sum + (row.value ?? 0), 0) / answered
      : null;
  return { answered, bars, average };
}

/** De tekst achter "Kopieer voor de POC": wat een RiVer in zijn notities plakt. */
export function pollResultsText(input: {
  title: string;
  turnoutLine: string;
  questions: Array<{ text: string; lines: string[] }>;
}): string {
  const blocks = input.questions.map((question) => [question.text, ...question.lines.map((line) => `- ${line}`)].join("\n"));
  return [input.title, input.turnoutLine, ...blocks].join("\n\n");
}
