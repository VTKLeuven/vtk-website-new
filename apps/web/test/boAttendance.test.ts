import { describe, expect, it } from "vitest";
import { minutesFromDocumentXml, statusOfColor, type MinutesEntry } from "@/lib/bo/attendance/parse";
import { buildAttendance, changesSince, rankOf, type MeetingInput, type RosterInput } from "@/lib/bo/attendance/stats";

/*
 * De aanwezigheden uit de verslagen van het BO (/admin/apps/aanwezigheden).
 * De namen hieronder zijn verzonnen: een echt verslag hoort niet in de repo.
 */

const GREEN = "6aa84f";
const ORANGE = "e69138";
const RED = "cc0000";

const run = (text: string, color?: string) =>
  `<w:r><w:rPr>${color ? `<w:color w:val="${color}"/>` : ""}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p><w:pPr><w:color w:val="ff0000"/></w:pPr>${runs.join("")}</w:p>`;
const doc = (...paragraphs: string[]) => `<w:document><w:body>${paragraphs.join("")}</w:body></w:document>`;

const LEGEND = para(run("Aanwezig", GREEN), run(" - "), run("Verontschuldigd", ORANGE), run(" - "), run("Afwezig", RED));

describe("verslag lezen", () => {
  it("leest de kop, de namen in hun kleur en de legende", () => {
    const parsed = minutesFromDocumentXml(
      doc(
        para(run("VERSLAG")),
        para(run("BO 3 - 20/09/2026 - 21u00 - QDV 00.100")),
        para(run("Aanwezigheden:")),
        para(run("Ada Peeters", GREEN)),
        para(run("Bram ", ORANGE), run("Claes", ORANGE)),
        para(run("Cato Dewit", RED)),
        para(run("Dirk Evers")),
        LEGEND,
        para(run("Goedkeuren agenda")),
        para(run("Niemand Meer", GREEN)),
      ),
    );
    expect(parsed).toEqual({
      title: "BO 3 - 20/09/2026 - 21u00 - QDV 00.100",
      legend: true,
      entries: [
        { name: "Ada Peeters", color: GREEN, status: "PRESENT" },
        { name: "Bram Claes", color: ORANGE, status: "EXCUSED" },
        { name: "Cato Dewit", color: RED, status: "ABSENT" },
        // Nog niet ingekleurd: telt nergens mee.
        { name: "Dirk Evers", color: null, status: null },
      ],
    });
  });

  it("zet een afwijkende tint op de status die erbij hoort", () => {
    expect(statusOfColor("ff9900")).toBe("EXCUSED");
    expect(statusOfColor("93c47d")).toBe("PRESENT");
    expect(statusOfColor("e06666")).toBe("ABSENT");
    expect(statusOfColor("999999")).toBeNull();
    // De legende van het verslag gaat voor de tint.
    expect(statusOfColor("123456", new Map([["123456", "PRESENT"]]))).toBe("PRESENT");
  });

  it("splitst namen op één regel en laat een geschrapte naam weg", () => {
    const parsed = minutesFromDocumentXml(
      doc(
        para(run("Aanwezigheden")),
        para(run("Eva Frans", GREEN), run(", "), run("Gert Hoste", RED)),
        para(`<w:del>${run("Weg Gedaan", GREEN)}</w:del>`, run("Ilse Jans", ORANGE)),
        LEGEND,
      ),
    );
    expect("entries" in parsed && parsed.entries.map((e) => [e.name, e.status])).toEqual([
      ["Eva Frans", "PRESENT"],
      ["Gert Hoste", "ABSENT"],
      ["Ilse Jans", "EXCUSED"],
    ]);
  });

  it("zonder legende stopt de lijst bij de volgende kop", () => {
    const parsed = minutesFromDocumentXml(
      doc(para(run("Aanwezigheden")), para(run("Eva Frans", GREEN)), para(run("Goedkeuren van de agenda van vorige week"))),
    );
    expect(parsed).toMatchObject({ legend: false, entries: [{ name: "Eva Frans", status: "PRESENT" }] });
  });

  it("meldt een verslag zonder aanwezigheden", () => {
    expect(minutesFromDocumentXml(doc(para(run("VERSLAG")), para(run("Agenda"))))).toEqual({ error: "NO_ATTENDANCE" });
  });
});

describe("aanwezigheden rekenen", () => {
  const roster: RosterInput[] = [
    { userId: "u-ada", name: "Ada Peeters", firstName: "Ada", lastName: "Peeters", posts: ["Groep 5"] },
    { userId: "u-bram", name: "Bram Claes", firstName: "Bram", lastName: "Claes", posts: ["IT"] },
    { userId: "u-cato", name: "Cato Dewit", firstName: "Cato", lastName: "Dewit", posts: ["IT"] },
  ];
  const e = (name: string, status: MinutesEntry["status"]): MinutesEntry => ({ name, status, color: status ? "x" : null });
  const meeting = (n: number, entries: MinutesEntry[]): MeetingInput => ({
    id: `m${n}`,
    label: `BO ${n}`,
    date: new Date(Date.UTC(2026, 8, n * 7)),
    title: null,
    minutesUrl: null,
    entries,
  });
  // Bewust door elkaar: de volgorde komt van de datum.
  const meetings = [
    meeting(3, [e("Ada Peeters", "PRESENT"), e("Bram Claes", "ABSENT"), e("Cato Dewit", "PRESENT"), e("Zeno Onbekend", "PRESENT")]),
    meeting(1, [e("Ada Peeters", "PRESENT"), e("Bram Claes", "EXCUSED"), e("Cato Dewit", "ABSENT")]),
    meeting(2, [e("Ada Peeters", "PRESENT"), e("Bram Claes", "ABSENT"), e("cato dewit", "PRESENT")]),
    meeting(4, [e("Ada Peeters", "PRESENT"), e("Bram Claes", "ABSENT"), e("Cato Dewit", null)]),
  ];
  const overview = buildAttendance(meetings, roster);
  const person = (key: string) => overview.people.find((p) => p.key === key)!;

  it("koppelt de namen aan het praesidium en rekent per persoon", () => {
    expect(overview.meetings.map((m) => m.label)).toEqual(["BO 1", "BO 2", "BO 3", "BO 4"]);
    expect(person("u-ada")).toMatchObject({ present: 4, rate: 1, presentStreak: 4, posts: ["Groep 5"] });
    expect(person("u-bram")).toMatchObject({ present: 0, excused: 1, absent: 3, rate: 0, absentStreak: 3, lastMissed: 3 });
    // Andere schrijfwijze, zelfde persoon; een naam zonder kleur telt niet.
    expect(person("u-cato")).toMatchObject({ present: 2, absent: 1, unknown: 1, listed: 4, cells: ["ABSENT", "PRESENT", "PRESENT", "UNKNOWN"] });
    expect(person("naam:zeno onbekend")).toMatchObject({ userId: null, cells: [null, null, "PRESENT", null] });
    expect(overview.unmatched.map((p) => p.name)).toEqual(["Zeno Onbekend"]);
  });

  it("rekent per BO, per post en wie opvolging nodig heeft", () => {
    expect(overview.meetings[0]).toMatchObject({ present: 1, excused: 1, absent: 1 });
    expect(overview.meetings[0].rate).toBeCloseTo(1 / 3);
    expect(overview.posts.map((p) => [p.post, p.members, p.rate])).toEqual([
      ["Groep 5", 1, 1],
      ["IT", 2, 2 / 7],
    ]);
    expect(overview.followUp.map((p) => p.key)).toEqual(["u-bram"]);
    expect(rankOf(overview.people, "u-cato")).toEqual({ rank: 2, of: 3 });
  });

  it("toont wat veranderde tegenover de vorige BO", () => {
    const changes = changesSince(overview.meetings, overview.people, 1)!;
    expect(changes.returned.map((p) => p.key)).toEqual(["u-cato"]);
    expect(changes.dropped).toEqual([]);
    expect(changesSince(overview.meetings, overview.people, 0)).toBeNull();
  });
});
