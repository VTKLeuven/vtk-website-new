import { describe, expect, it } from "vitest";
import {
  MAX_OPEN_ANSWER_LENGTH,
  nameInitials,
  parsePollAnswers,
  pollFieldName,
  pollIsForViewer,
  pollIsOpen,
  pollStatus,
} from "@/lib/pocPolls/core";
import { pollPanelText, pollStripCopy } from "@/lib/pocPolls/copy";
import {
  addHiddenPoll,
  decidePollStrip,
  isPollHomePath,
  parseHiddenPolls,
  pollStripFits,
} from "@/lib/pocPolls/strip";

const questions = [
  { id: "a", kind: "YES_NO" as const },
  { id: "b", kind: "SCORE" as const },
  { id: "c", kind: "OPEN" as const },
];

function reader(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe("parsePollAnswers", () => {
  it("leest elke soort vraag", () => {
    const result = parsePollAnswers(
      questions,
      reader({ [pollFieldName("a")]: "0", [pollFieldName("b")]: "4", [pollFieldName("c")]: "  Meer lesopnames  " }),
    );
    expect(result).toEqual({
      ok: true,
      answers: [
        { questionId: "a", value: 0, text: null },
        { questionId: "b", value: 4, text: null },
        { questionId: "c", value: null, text: "Meer lesopnames" },
      ],
    });
  });

  it("laat een overgeslagen vraag weg in plaats van te weigeren", () => {
    const result = parsePollAnswers(questions, reader({ [pollFieldName("b")]: "1", [pollFieldName("c")]: "   " }));
    expect(result).toEqual({ ok: true, answers: [{ questionId: "b", value: 1, text: null }] });
  });

  it("weigert een waarde die het formulier niet kan sturen", () => {
    expect(parsePollAnswers(questions, reader({ [pollFieldName("a")]: "2" }))).toEqual({ ok: false, code: "POLL_INVALID" });
    expect(parsePollAnswers(questions, reader({ [pollFieldName("b")]: "6" }))).toEqual({ ok: false, code: "POLL_INVALID" });
    expect(parsePollAnswers(questions, reader({ [pollFieldName("b")]: "0" }))).toEqual({ ok: false, code: "POLL_INVALID" });
  });

  it("telt een nieuwe regel uit een textarea als één teken", () => {
    const fits = "x".repeat(MAX_OPEN_ANSWER_LENGTH - 1).replace(/^x/, "\r\n");
    expect(parsePollAnswers(questions, reader({ [pollFieldName("c")]: `y${fits}` })).ok).toBe(true);
    const long = "x".repeat(MAX_OPEN_ANSWER_LENGTH + 1);
    expect(parsePollAnswers(questions, reader({ [pollFieldName("c")]: long }))).toEqual({ ok: false, code: "POLL_TOO_LONG" });
  });
});

describe("pollIsOpen", () => {
  const poll = { opensAt: "2026-11-08T10:00:00.000Z", closesAt: "2026-11-22T22:59:00.000Z" };

  it("is open vanaf de start en dicht op het sluitmoment", () => {
    expect(pollIsOpen(poll, new Date("2026-11-08T09:59:59.000Z"))).toBe(false);
    expect(pollIsOpen(poll, new Date("2026-11-08T10:00:00.000Z"))).toBe(true);
    expect(pollIsOpen(poll, new Date("2026-11-22T22:59:00.000Z"))).toBe(false);
  });
});

describe("pollIsForViewer", () => {
  const poll = { programmes: ["COMPUTER_SCIENCE"], studyYears: [] as string[] };

  it("vraagt minstens één gedeelde richting", () => {
    expect(pollIsForViewer(poll, { programmes: ["ENERGY", "COMPUTER_SCIENCE"], years: [] })).toBe(true);
    expect(pollIsForViewer(poll, { programmes: ["ENERGY"], years: [] })).toBe(false);
    expect(pollIsForViewer({ programmes: [], studyYears: [] }, { programmes: ["ENERGY"], years: [] })).toBe(false);
  });

  it("kijkt de fase enkel na wanneer er gekozen is", () => {
    const masters = { ...poll, studyYears: ["MASTER_1"] };
    expect(pollIsForViewer(masters, { programmes: ["COMPUTER_SCIENCE"], years: ["MASTER_1"] })).toBe(true);
    expect(pollIsForViewer(masters, { programmes: ["COMPUTER_SCIENCE"], years: ["BACHELOR_2"] })).toBe(false);
  });
});

describe("pollStatus", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const dates = { opensAt: "2026-11-08T10:00:00.000Z", closesAt: "2026-11-22T22:59:00.000Z" };

  it("onderscheidt concept, open en afgesloten", () => {
    expect(pollStatus({ ...dates, publishedAt: null }, now)).toBe("DRAFT");
    expect(pollStatus({ ...dates, publishedAt: dates.opensAt }, now)).toBe("OPEN");
    expect(pollStatus({ ...dates, publishedAt: dates.opensAt }, new Date("2026-11-23T00:00:00.000Z"))).toBe("CLOSED");
  });
});

describe("waar de strook staat", () => {
  it("herkent de homepage in beide talen", () => {
    expect(isPollHomePath("/")).toBe(true);
    expect(isPollHomePath("/nl")).toBe(true);
    expect(isPollHomePath("/en")).toBe(true);
    expect(isPollHomePath("/en/")).toBe(true);
    expect(isPollHomePath("/kalender")).toBe(false);
    expect(isPollHomePath("/energie")).toBe(false);
  });

  it("staat voor een student overal behalve in het beheer en tijdens een flow", () => {
    expect(pollStripFits("site", "/")).toBe(true);
    expect(pollStripFits("site", "/kalender")).toBe(true);
    expect(pollStripFits("site", "/en/kalender")).toBe(true);
    expect(pollStripFits("site", "/admin/pocs")).toBe(false);
    expect(pollStripFits("site", "/tickets/bestelling/abc")).toBe(false);
    expect(pollStripFits("site", "/inloggen")).toBe(false);
    expect(pollStripFits("site", "/tickets")).toBe(true);
  });

  it("de algemene strook staat enkel op de homepage", () => {
    expect(pollStripFits("home", "/")).toBe(true);
    expect(pollStripFits("home", "/en")).toBe(true);
    expect(pollStripFits("home", "/kalender")).toBe(false);
  });
});

describe("het verbergcookie", () => {
  it("houdt de recentste vooraan en begrenst de lijst", () => {
    let value = "";
    for (let i = 0; i < 12; i++) value = addHiddenPoll(value, `poll${i}`);
    const ids = parseHiddenPolls(value);
    expect(ids[0]).toBe("poll11");
    expect(ids).toHaveLength(8);
  });

  it("negeert wat geen id is", () => {
    expect(parseHiddenPolls("abc,<script>,def")).toEqual(["abc", "def"]);
    expect(parseHiddenPolls(undefined)).toEqual([]);
  });
});

describe("decidePollStrip", () => {
  const open = { id: "p1", answered: false };
  const done = { id: "p2", answered: true };
  const base = { openPollIds: ["p1", "p2"], hiddenPollIds: [] as string[] };

  it("kiest de eerste peiling die nog niet ingevuld is", () => {
    expect(decidePollStrip({ ...base, signedIn: true, programmeCount: 1, viewerPolls: [done, open] })).toEqual({ kind: "poll", poll: open });
  });

  it("verdwijnt na het invullen en na het wegklikken", () => {
    expect(decidePollStrip({ ...base, signedIn: true, programmeCount: 1, viewerPolls: [done] })).toBeNull();
    expect(decidePollStrip({ ...base, hiddenPollIds: ["p1"], signedIn: true, programmeCount: 1, viewerPolls: [open] })).toBeNull();
  });

  it("toont niets aan een student van een andere richting", () => {
    expect(decidePollStrip({ ...base, signedIn: true, programmeCount: 1, viewerPolls: [] })).toBeNull();
  });

  it("vraagt om aan te melden of een richting in te stellen", () => {
    expect(decidePollStrip({ ...base, signedIn: false, programmeCount: 0, viewerPolls: [] })).toEqual({ kind: "signIn", pollId: "p1" });
    expect(decidePollStrip({ ...base, signedIn: true, programmeCount: 0, viewerPolls: [] })).toEqual({ kind: "noProgramme", pollId: "p1" });
  });
});

describe("de teksten", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const closesAt = "2026-11-22T22:59:00.000Z";

  it("zegt waarom je antwoord telt wanneer de vergadering gekend is", () => {
    const copy = pollStripCopy("poll", { locale: "nl", questionCount: 4, meetingDate: "2026-11-24", closesAt, now });
    expect(copy.text).toBe("Op 24 november zitten je RiVers met je proffen rond de tafel op de POC.");
    expect(copy.strong).toBe("Ze hebben een paar vraagjes voor jullie.");
    expect(copy.action).toBe("4 korte vragen");
  });

  it("valt terug zonder datum en wanneer de vergadering voorbij is", () => {
    const expected = "Je RiVers vragen je mening voor de POC.";
    expect(pollStripCopy("poll", { locale: "nl", questionCount: 1, meetingDate: null, closesAt, now }).text).toBe(expected);
    expect(pollStripCopy("poll", { locale: "nl", questionCount: 1, meetingDate: "2026-11-01", closesAt, now }).text).toBe(expected);
    expect(pollStripCopy("poll", { locale: "nl", questionCount: 1, meetingDate: null, closesAt, now }).action).toBe("1 korte vraag");
  });

  it("zet de laatste twee dagen de deadline voorop", () => {
    const saturday = new Date("2026-11-21T12:00:00.000Z");
    expect(pollStripCopy("poll", { locale: "nl", questionCount: 4, meetingDate: "2026-11-24", closesAt, now: saturday }).text).toBe(
      "Nog tot zondag verzamelen je RiVers meningen voor de POC.",
    );
    const sunday = new Date("2026-11-22T12:00:00.000Z");
    expect(pollStripCopy("poll", { locale: "nl", questionCount: 4, meetingDate: "2026-11-24", closesAt, now: sunday }).text).toBe(
      "Vandaag verzamelen je RiVers de laatste meningen voor de POC.",
    );
  });

  it("rekent de deadline op de Brusselse klok", () => {
    const text = pollPanelText({ locale: "nl", meetingDate: "2026-11-24", closesAt, now });
    expect(text.openUntil).toBe("Open tot zo 22 november");
    expect(text.lead).toContain("dinsdag 24 november");
    expect(text.thanks).toContain("24 november");
  });
});

describe("nameInitials", () => {
  it("neemt de eerste en de laatste naam", () => {
    expect(nameInitials("Noor El Amrani")).toBe("NA");
    expect(nameInitials("Lotte")).toBe("LO");
    expect(nameInitials("  ")).toBe("");
  });
});
