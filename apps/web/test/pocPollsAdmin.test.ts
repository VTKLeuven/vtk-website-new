import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDiscordLinkToken, readDiscordLinkToken } from "@/lib/discord/linkToken";
import { desiredPocRoleIds, managedRoleIds, roleChanges } from "@/lib/discord/pocRoles";
import {
  DISCORD_LINK_PANEL_ID,
  discordAccessMessage,
  discordLinkPanelMessage,
  parsePollCustomId,
  pollChannelMessage,
  pollClosedChannelMessage,
  pollCustomId,
  pollModalValue,
  pollOpenModal,
  pollStepMessage,
  type DiscordPollView,
} from "@/lib/discord/pollMessages";
import { verifyDiscordSignature } from "@/lib/discord/verify";
import { parseBrusselsInput, parsePollDraft, toBrusselsInput } from "@/lib/pocPolls/draft";
import { computeTurnout, questionResult, rowsForPhase, type ResultRow } from "@/lib/pocPolls/results";
import { pollAnswerRef, pollVoterKey } from "@/lib/pocPolls/voterKey";

const now = new Date("2026-11-08T12:00:00.000Z");
const draftInput = {
  title: "Werkdruk",
  closesAt: "2026-11-22T23:59",
  meetingDate: "2026-11-24",
  questions: JSON.stringify([{ kind: "YES_NO", text: "Vraag?", low: "", high: "" }]),
  studyYears: [],
};

describe("parsePollDraft", () => {
  it("leest een volledige peiling op de Brusselse klok", () => {
    const result = parsePollDraft(draftInput, { publish: true, now });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.closesAt.toISOString()).toBe("2026-11-22T22:59:00.000Z");
      expect(result.draft.meetingDate?.toISOString()).toBe("2026-11-24T00:00:00.000Z");
    }
  });

  it("laat een concept onaf, maar publiceren niet", () => {
    const empty = { ...draftInput, questions: JSON.stringify([{ kind: "YES_NO", text: "  " }]) };
    expect(parsePollDraft(empty, { publish: false, now }).ok).toBe(true);
    expect(parsePollDraft(empty, { publish: true, now })).toEqual({ ok: false, code: "POLL_QUESTION_EMPTY" });
    expect(parsePollDraft({ ...draftInput, questions: "[]" }, { publish: true, now })).toEqual({ ok: false, code: "POLL_NO_QUESTIONS" });
  });

  it("weigert te veel vragen, een deadline in het verleden en rommel", () => {
    const six = JSON.stringify(Array.from({ length: 6 }, () => ({ kind: "OPEN", text: "x" })));
    expect(parsePollDraft({ ...draftInput, questions: six }, { publish: false, now })).toEqual({ ok: false, code: "POLL_TOO_MANY" });
    expect(parsePollDraft({ ...draftInput, closesAt: "2026-11-01T10:00" }, { publish: true, now })).toEqual({ ok: false, code: "POLL_CLOSES_PAST" });
    expect(parsePollDraft({ ...draftInput, questions: "{" }, { publish: false, now })).toEqual({ ok: false, code: "POLL_QUESTIONS_INVALID" });
    expect(parsePollDraft({ ...draftInput, title: " " }, { publish: false, now })).toEqual({ ok: false, code: "POLL_TITLE" });
  });

  it("bewaart labels enkel bij een score", () => {
    const questions = JSON.stringify([{ kind: "YES_NO", text: "a", low: "x", high: "y" }, { kind: "SCORE", text: "b", low: "x", high: "" }]);
    const result = parsePollDraft({ ...draftInput, questions }, { publish: true, now });
    expect(result.ok && result.draft.questions.map((q) => [q.low, q.high])).toEqual([[null, null], ["x", null]]);
  });

  it("zet een moment heen en terug zonder te verschuiven", () => {
    const moment = new Date("2026-07-01T20:30:00.000Z");
    expect(parseBrusselsInput(toBrusselsInput(moment))?.toISOString()).toBe(moment.toISOString());
  });
});

describe("resultaten", () => {
  const row = (voterKey: string, value: number, studyYears: string[]): ResultRow => ({ questionId: "q", voterKey, value, text: null, studyYears });

  it("telt een student één keer en verbergt kleine groepen", () => {
    const rows = [row("a", 1, ["MASTER_1"]), row("a", 2, ["MASTER_1"]), row("b", 1, ["BACHELOR_2"])];
    const turnout = computeTurnout(rows, { total: 10, perYear: { MASTER_1: 5, BACHELOR_2: 5, BACHELOR_3: 0 } });
    expect(turnout.answered).toBe(2);
    expect(turnout.share).toBe(20);
    expect(turnout.phases.map((phase) => phase.year)).toEqual(["MASTER_1", "BACHELOR_2"]);
    expect(turnout.phases.every((phase) => phase.tooFew)).toBe(true);
  });

  it("rekent aandelen en het gemiddelde", () => {
    const score = questionResult("SCORE", [{ value: 5, text: null }, { value: 4, text: null }, { value: 3, text: null }]);
    expect(score.average).toBe(4);
    expect(score.bars.find((bar) => bar.value === 5)).toEqual({ value: 5, count: 1, share: 33 });
    const yesNo = questionResult("YES_NO", [{ value: 1, text: null }, { value: 0, text: null }]);
    expect(yesNo.bars.map((bar) => bar.value)).toEqual([1, 0]);
    expect(yesNo.average).toBeNull();
    expect(questionResult("OPEN", [{ value: null, text: "x" }]).answered).toBe(1);
  });

  it("filtert op fase", () => {
    const rows = [row("a", 1, ["MASTER_1"]), row("b", 1, ["BACHELOR_2"])];
    expect(rowsForPhase(rows, "MASTER_1")).toHaveLength(1);
    expect(rowsForPhase(rows, null)).toHaveLength(2);
  });
});

describe("anonieme sleutels", () => {
  it("verschillen per peiling en tonen de gebruiker niet", () => {
    const key = pollVoterKey("p1", "user-123");
    expect(key).toBe(pollVoterKey("p1", "user-123"));
    expect(key).not.toBe(pollVoterKey("p2", "user-123"));
    expect(key).not.toContain("user-123");
  });

  it("de verwijzing in de resultaten verschilt per vraag", () => {
    expect(pollAnswerRef("q1", "k")).not.toBe(pollAnswerRef("q2", "k"));
  });
});

describe("POC-rollen op Discord", () => {
  const pocs = [
    { discordRoleId: "cw", studyProgrammes: ["COMPUTER_SCIENCE"] },
    { discordRoleId: "ba", studyProgrammes: ["COMMON_BACHELOR", "COMPUTER_SCIENCE"] },
    { discordRoleId: null, studyProgrammes: ["COMPUTER_SCIENCE"] },
    { discordRoleId: "wtk", studyProgrammes: ["MECHANICAL"] },
  ];
  const account = { live: true, confirmed: true, programmes: ["COMPUTER_SCIENCE"] };

  it("geeft de rollen van de POC's van je richting, en een POC zonder rol telt niet", () => {
    expect(desiredPocRoleIds(pocs, account)).toEqual(["cw", "ba"]);
  });

  it("geeft niets zonder bevestigde studie of aan een inactief account", () => {
    expect(desiredPocRoleIds(pocs, { ...account, confirmed: false })).toEqual([]);
    expect(desiredPocRoleIds(pocs, { ...account, live: false })).toEqual([]);
  });

  it("twee POC's met dezelfde rol geven die rol één keer", () => {
    const shared = [
      { discordRoleId: "x", studyProgrammes: ["CIVIL"] },
      { discordRoleId: "x", studyProgrammes: ["CIVIL"] },
    ];
    expect(desiredPocRoleIds(shared, { ...account, programmes: ["CIVIL"] })).toEqual(["x"]);
  });

  it("verandert enkel wat verschilt", () => {
    expect(roleChanges(["cw", "oud"], ["cw", "ba"])).toEqual({ add: ["ba"], remove: ["oud"] });
    expect(roleChanges(["cw"], ["cw"])).toEqual({ add: [], remove: [] });
  });

  it("blijft van de andere rollen van een lid af", () => {
    expect(managedRoleIds(["moderator", "cw", "oud"], pocs, ["oud"])).toEqual(["cw", "oud"]);
  });
});

describe("discord", () => {
  const view: DiscordPollView = {
    id: "cmw89jayw0000s05nmey0dewl",
    title: "Werkdruk",
    pocName: "Computerwetenschappen",
    closesAt: new Date("2026-11-22T22:59:00.000Z"),
    meetingDate: "2026-11-24",
    siteOrigin: "https://vtk.be",
    questions: [
      { id: "q1", kind: "YES_NO", text: "Vraag?", low: null, high: null },
      { id: "q2", kind: "OPEN", text: "Een open vraag die langer is dan vijfenveertig tekens lang?", low: null, high: null },
    ],
  };
  const single = { ...view, questions: [{ id: "q1", kind: "SCORE" as const, text: "Stelling.", low: null, high: null }] };
  const allowed = (message: { components?: { components: unknown[] }[] }) => message.components?.flatMap((row) => row.components) ?? [];

  it("zet custom ids heen en terug, binnen de limiet", () => {
    const id = pollCustomId(view.id, "a", 3, 1);
    expect(id.length).toBeLessThanOrEqual(100);
    expect(parsePollCustomId(id)).toEqual({ pollId: view.id, action: "a", index: 3, value: 1 });
    expect(parsePollCustomId(pollCustomId(view.id, "s"))).toEqual({ pollId: view.id, action: "s", index: 0, value: null });
    expect(parsePollCustomId("iets anders")).toBeNull();
    expect(parsePollCustomId(undefined)).toBeNull();
  });

  it("één vraag met knoppen in het kanaal, de rest met een startknop", () => {
    expect(allowed(pollChannelMessage(single))).toHaveLength(5);
    const series = allowed(pollChannelMessage(view)) as Array<{ label: string }>;
    expect(series.map((button) => button.label)).toEqual(["Start de peiling", "Invullen op vtk.be"]);
  });

  it("pingt nooit iemand", () => {
    expect(pollChannelMessage(view).allowed_mentions).toEqual({ parse: [] });
  });

  it("een antwoordstap is enkel voor wie klikte", () => {
    const step = pollStepMessage(view, 0, undefined);
    expect(step.flags).toBe(64);
    expect(step.content).toContain("Vraag 1 van 2");
  });

  it("toont het eigen antwoord en respecteert de limieten van een pop-up", () => {
    const answered = allowed(pollStepMessage(view, 0, { value: 1, text: null })) as Array<{ label: string; style: number }>;
    expect(answered.find((button) => button.label === "Ja")?.style).toBe(1);
    const modal = pollOpenModal(view, 1, null);
    expect(modal.components[0].label.length).toBeLessThanOrEqual(45);
    expect(modal.title.length).toBeLessThanOrEqual(45);
  });

  it("leest het antwoord uit een pop-up, ook in de oude vorm", () => {
    expect(pollModalValue([{ type: 18, component: { type: 4, custom_id: "antwoord", value: "tekst" } }])).toBe("tekst");
    expect(pollModalValue([{ type: 1, components: [{ type: 4, custom_id: "antwoord", value: "oud" }] }])).toBe("oud");
    expect(pollModalValue([])).toBeNull();
  });

  it("zet de knoppen uit na de deadline", () => {
    const closed = pollClosedChannelMessage(single, 84, { summaryPublished: false, meetingAhead: true });
    expect((allowed(closed) as Array<{ disabled?: boolean }>).every((button) => button.disabled)).toBe(true);
    expect(closed.embeds?.[0].description).toContain("84 studenten");
    const withSummary = allowed(pollClosedChannelMessage(single, 1, { summaryPublished: true, meetingAhead: false })) as Array<{ label: string }>;
    expect(withSummary[0].label).toBe("Bekijk de samenvatting");
  });

  it("het koppelbericht is publiek, pingt niemand en is geen knop van een peiling", () => {
    const panel = discordLinkPanelMessage();
    expect(panel.flags).toBeUndefined();
    expect(panel.allowed_mentions.parse).toEqual([]);
    expect(allowed(panel)).toEqual([expect.objectContaining({ custom_id: DISCORD_LINK_PANEL_ID })]);
    expect(parsePollCustomId(DISCORD_LINK_PANEL_ID)).toBeNull();
  });

  it("wat je na het koppelen ziet, is enkel voor wie klikte", () => {
    expect(discordAccessMessage(["Computerwetenschappen"]).flags).toBe(64);
  });

  it("controleert de handtekening echt", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
    const body = JSON.stringify({ type: 1 });
    const signatureHex = sign(null, Buffer.from(`123${body}`), privateKey).toString("hex");
    expect(verifyDiscordSignature({ publicKeyHex: raw, signatureHex, timestamp: "123", body })).toBe(true);
    expect(verifyDiscordSignature({ publicKeyHex: raw, signatureHex, timestamp: "124", body })).toBe(false);
    expect(verifyDiscordSignature({ publicKeyHex: raw, signatureHex, timestamp: "123", body: `${body} ` })).toBe(false);
    expect(verifyDiscordSignature({ publicKeyHex: raw, signatureHex: null, timestamp: "123", body })).toBe(false);
    expect(verifyDiscordSignature({ publicKeyHex: raw, signatureHex: "abc", timestamp: "123", body })).toBe(false);
  });

  it("de koppellink is ondertekend en verloopt", () => {
    const token = createDiscordLinkToken("42", "student", now);
    expect(readDiscordLinkToken(token, now)).toEqual({ discordId: "42", username: "student" });
    expect(readDiscordLinkToken(token, new Date(now.getTime() + 16 * 60 * 1000))).toBeNull();
    expect(readDiscordLinkToken(`${token}x`, now)).toBeNull();
    const [payload] = token.split(".");
    expect(readDiscordLinkToken(`${payload}.vervalst`, now)).toBeNull();
  });
});
