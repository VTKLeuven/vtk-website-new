import { describe, expect, it } from "vitest";
import {
  makeGroups,
  splitNames,
  type GroupingEntryInput,
  type GroupingFieldSpec,
} from "@/lib/forms/grouping/algorithm";

const onthaalFields: GroupingFieldSpec[] = [
  { fieldId: "naam", role: "NAME", kind: "text", weight: 1, options: [] },
  { fieldId: "rol", role: "ANCHOR", kind: "choice", weight: 1, options: ["peter"] },
  { fieldId: "aantal", role: "GROUP_SIZE", kind: "number", weight: 1, options: [] },
  { fieldId: "namen", role: "GROUP_NAMES", kind: "text", weight: 1, options: [] },
  { fieldId: "extra", role: "ACCEPTS_EXTRA", kind: "boolean", weight: 1, options: ["true"] },
  { fieldId: "richting", role: "SIMILAR", kind: "choice", weight: 3, options: [] },
  { fieldId: "uitgaan", role: "SIMILAR", kind: "number", weight: 1, options: [] },
];

function kid(id: string, richting: string, uitgaan: number, extra: Partial<GroupingEntryInput["answers"]> = {}): GroupingEntryInput {
  return {
    id,
    answers: {
      naam: { text: id },
      rol: { options: ["kind"] },
      richting: { options: [richting] },
      uitgaan: { number: uitgaan },
      ...extra,
    },
  };
}

function peter(id: string, richting: string, size = 1, accepts = true): GroupingEntryInput {
  return {
    id,
    answers: {
      naam: { text: id },
      rol: { options: ["peter"] },
      aantal: { number: size },
      extra: { bool: accepts },
      richting: { options: [richting] },
      uitgaan: { number: 2 },
    },
  };
}

function peopleIn(
  result: ReturnType<typeof makeGroups>,
  entries: GroupingEntryInput[],
  fields: GroupingFieldSpec[]
) {
  const sizes = new Map(
    entries.map((entry) => {
      const sizeField = fields.find((field) => field.role === "GROUP_SIZE");
      const size = sizeField ? entry.answers[sizeField.fieldId]?.number ?? 1 : 1;
      return [entry.id, size];
    })
  );
  return result.groups.map((group) => ({
    members: group.members
      .filter((member) => !member.isAnchor)
      .reduce((sum, member) => sum + (sizes.get(member.entryId) ?? 1), 0),
    anchors: group.members
      .filter((member) => member.isAnchor)
      .reduce((sum, member) => sum + (sizes.get(member.entryId) ?? 1), 0),
  }));
}

describe("splitNames", () => {
  it("splitst op komma's, puntkomma's en 'en'", () => {
    expect(splitNames("Jan, Piet; Joris en Korneel")).toEqual(["Jan", "Piet", "Joris", "Korneel"]);
    expect(splitNames("")).toEqual([]);
  });
});

describe("makeGroups: onthaal", () => {
  const entries: GroupingEntryInput[] = [];
  for (let index = 0; index < 30; index += 1) {
    entries.push(kid(`burgie${index}`, "burgie", index % 3));
    entries.push(kid(`archie${index}`, "archie", index % 3));
  }
  // Twee kerngroepen van vijf en tien losse peters/meters.
  entries.push(peter("team-burgie", "burgie", 5));
  entries.push(peter("team-archie", "archie", 5, false));
  for (let index = 0; index < 10; index += 1) {
    entries.push(peter(`losse${index}`, index % 2 ? "burgie" : "archie"));
  }

  const params = { minMembers: 14, maxMembers: 16, minAnchors: 5, maxAnchors: 6 };
  const result = makeGroups(entries, onthaalFields, params);

  it("houdt elke groep binnen de grenzen", () => {
    const counts = peopleIn(result, entries, onthaalFields);
    expect(counts).toHaveLength(4);
    for (const count of counts) {
      expect(count.members).toBeGreaterThanOrEqual(14);
      expect(count.members).toBeLessThanOrEqual(16);
      expect(count.anchors).toBeGreaterThanOrEqual(5);
      expect(count.anchors).toBeLessThanOrEqual(6);
    }
    expect(result.warnings).toEqual([]);
  });

  it("geeft elke kerngroep haar eigen groep en respecteert een gesloten groep", () => {
    const burgie = result.groups.findIndex((group) =>
      group.members.some((member) => member.entryId === "team-burgie")
    );
    const archie = result.groups.findIndex((group) =>
      group.members.some((member) => member.entryId === "team-archie")
    );
    expect(burgie).not.toBe(archie);
    const archieAnchors = result.groups[archie].members.filter((member) => member.isAnchor);
    expect(archieAnchors.map((member) => member.entryId)).toEqual(["team-archie"]);
  });

  it("zet gelijke antwoorden samen", () => {
    for (const group of result.groups) {
      const kids = group.members.filter((member) => !member.isAnchor);
      const burgies = kids.filter((member) => member.entryId.startsWith("burgie")).length;
      // Richting weegt het zwaarst: elke groep is (bijna) volledig één richting.
      expect(Math.max(burgies, kids.length - burgies) / kids.length).toBeGreaterThan(0.85);
    }
  });

  it("geeft bij dezelfde invoer dezelfde groepen", () => {
    expect(makeGroups(entries, onthaalFields, params)).toEqual(result);
  });
});

describe("makeGroups: internationaal", () => {
  const fields: GroupingFieldSpec[] = [
    { fieldId: "naam", role: "NAME", kind: "text", weight: 1, options: [] },
    { fieldId: "email", role: "IDENTIFIER", kind: "text", weight: 1, options: [] },
    { fieldId: "partner", role: "PARTNER", kind: "text", weight: 1, options: [] },
    { fieldId: "land", role: "DIVERSE", kind: "choice", weight: 5, options: [] },
  ];
  const countries = ["BE", "ES", "IT", "IN", "CN", "DE"];
  const entries: GroupingEntryInput[] = [];
  for (let index = 0; index < 36; index += 1) {
    entries.push({
      id: `p${index}`,
      answers: {
        naam: { text: `Persoon ${index}` },
        email: { text: `p${index}@student.kuleuven.be` },
        land: { options: [countries[Math.floor(index / 6)]] },
      },
    });
  }
  // p0 kiest p1 als partner via e-mail, p6 kiest "persoon 12" via naam.
  entries[0].answers = { ...entries[0].answers, partner: { text: "P1@student.kuleuven.be" } };
  entries[6].answers = { ...entries[6].answers, partner: { text: "persoon 12" } };
  entries[7].answers = { ...entries[7].answers, partner: { text: "Iemand Anders" } };

  const result = makeGroups(entries, fields, { minMembers: 6, maxMembers: 6 });
  const groupOf = (id: string) =>
    result.groups.findIndex((group) => group.members.some((member) => member.entryId === id));

  it("houdt partners samen", () => {
    expect(groupOf("p0")).toBe(groupOf("p1"));
    expect(groupOf("p6")).toBe(groupOf("p12"));
  });

  it("meldt een partner die niet gevonden werd", () => {
    expect(result.warnings).toContainEqual({
      code: "PARTNER_NOT_FOUND",
      entryId: "p7",
      detail: "Iemand Anders",
    });
  });

  it("spreidt de landen", () => {
    expect(result.groups).toHaveLength(6);
    for (const group of result.groups) {
      const lands = new Set(
        group.members.map((member) => countries[Math.floor(Number(member.entryId.slice(1)) / 6)])
      );
      // Zes landen in groepen van zes: hoogstens de partnerparen delen een land.
      expect(lands.size).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("makeGroups: randgevallen", () => {
  it("meldt een lege lijst", () => {
    expect(makeGroups([], onthaalFields, { minMembers: 1, maxMembers: 5 })).toEqual({
      groups: [],
      warnings: [{ code: "NO_ENTRIES" }],
    });
  });

  it("telt een groepsinschrijving als meerdere personen en splitst ze nooit", () => {
    const entries = [
      kid("groep", "burgie", 1, { aantal: { number: 4 }, namen: { text: "A, B, C" } }),
      ...Array.from({ length: 8 }, (_, index) => kid(`k${index}`, "archie", 1)),
    ];
    const result = makeGroups(entries, onthaalFields, { minMembers: 6, maxMembers: 6 });
    const counts = peopleIn(result, entries, onthaalFields);
    expect(counts.map((count) => count.members).sort()).toEqual([6, 6]);
  });
});
