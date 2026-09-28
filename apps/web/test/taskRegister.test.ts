import { describe, expect, it } from "vitest";
import type { SessionPayload } from "@vtk/auth";
import { buildRegister, countUnassigned, type RegisterPost, type RegisterTask } from "@/lib/tasks/register";
import { canEditAnyTasks, canEditTasksOf, taskEditScope } from "@/lib/tasks/access";

/**
 * Het register van /admin/wie-doet-wat. Het moet een vraag als "zaal huren"
 * beantwoorden zonder dat je weet welke post dat doet, en per post tonen wat
 * nog niemand heeft.
 */

const member = (membershipId: string, name: string, lead = false) => ({ membershipId, name, avatarUrl: null, lead });

const posts: RegisterPost[] = [
  { id: "theokot", name: "Theokot", canEdit: false, members: [member("m-lotte", "Lotte Peeters", true), member("m-hanne", "Hanne Maes"), member("m-wout", "Wout Janssens")] },
  { id: "it", name: "IT", canEdit: false, members: [member("m-seppe", "Seppe Mertens", true)] },
  { id: "sport", name: "Sport", canEdit: false, members: [] },
];

const task = (overrides: Partial<RegisterTask> & Pick<RegisterTask, "id" | "groupId" | "name">): RegisterTask => ({
  forGroupId: null,
  description: null,
  keywords: null,
  holders: [],
  backup: null,
  previous: [],
  ...overrides,
});

const tasks: RegisterTask[] = [
  task({ id: "verhuur", groupId: "theokot", name: "Verhuur van de zaal", keywords: "huren fuif", holders: ["m-hanne"], backup: "m-lotte" }),
  task({ id: "kassa", groupId: "theokot", name: "Kassa en afrekening", holders: ["m-lotte"] }),
  task({ id: "favv", groupId: "theokot", name: "Hygiëne en FAVV", previous: ["Jef Michiels"] }),
  task({ id: "it-theokot", groupId: "it", forGroupId: "theokot", name: "IT-contact voor Theokot", holders: ["m-seppe"] }),
  task({ id: "servers", groupId: "it", name: "Infrastructuur", description: "Servers en backups." }),
];

const all = { query: "", postId: null, onlyUnassigned: false };

describe("het register", () => {
  it("groepeert per post in de volgorde van de posten, ook een post zonder taken", () => {
    const sections = buildRegister(posts, tasks, all);
    expect(sections.map((s) => s.post.id)).toEqual(["theokot", "it", "sport"]);
    expect(sections[0].own.map((t) => t.id)).toEqual(["favv", "kassa", "verhuur"]);
    expect(sections[2].own).toEqual([]);
  });

  it("toont een taak voor een andere post ook bij die post, maar telt ze daar niet mee", () => {
    const [theokot, it] = buildRegister(posts, tasks, all);
    expect(theokot.linked.map((t) => t.id)).toEqual(["it-theokot"]);
    expect(it.own.map((t) => t.id)).toContain("it-theokot");
    expect(theokot.unassigned).toBe(1);
  });

  it("vindt een taak op een zoekwoord dat niet in de naam staat", () => {
    const sections = buildRegister(posts, tasks, { ...all, query: "zaal huren" });
    expect(sections.map((s) => s.post.id)).toEqual(["theokot"]);
    expect(sections[0].own.map((t) => t.id)).toEqual(["verhuur"]);
  });

  it("zoekt zonder op hoofdletters of accenten te letten", () => {
    const sections = buildRegister(posts, tasks, { ...all, query: "HYGIENE" });
    expect(sections[0].own.map((t) => t.id)).toEqual(["favv"]);
  });

  it("vindt alles wat iemand doet op zijn naam, ook als backup", () => {
    const sections = buildRegister(posts, tasks, { ...all, query: "lotte" });
    expect(sections[0].own.map((t) => t.id)).toEqual(["kassa", "verhuur"]);
  });

  it("vindt op de naam van een post ook de taken die voor die post bedoeld zijn", () => {
    const sections = buildRegister(posts, tasks, { ...all, query: "theokot" });
    const it = sections.find((s) => s.post.id === "it");
    expect(it?.own.map((t) => t.id)).toEqual(["it-theokot"]);
  });

  it("laat een post zonder treffer weg zodra er gefilterd wordt", () => {
    const sections = buildRegister(posts, tasks, { ...all, onlyUnassigned: true });
    expect(sections.map((s) => s.post.id)).toEqual(["theokot", "it"]);
    expect(sections[0].own.map((t) => t.id)).toEqual(["favv"]);
    expect(sections[1].own.map((t) => t.id)).toEqual(["servers"]);
  });

  it("toont met een gekozen post enkel die post", () => {
    const sections = buildRegister(posts, tasks, { ...all, postId: "sport" });
    expect(sections.map((s) => s.post.id)).toEqual(["sport"]);
  });

  it("noemt wie op de post zit maar nog geen taak heeft", () => {
    const [theokot] = buildRegister(posts, tasks, all);
    expect(theokot.idle.map((m) => m.name)).toEqual(["Wout Janssens"]);
  });

  it("telt de taken zonder verantwoordelijke, over alle posten of voor één", () => {
    expect(countUnassigned(tasks, null)).toBe(2);
    expect(countUnassigned(tasks, "theokot")).toBe(1);
  });
});

describe("wie mag verdelen", () => {
  const session = (permissions: string[], groups: { id: string; type: "PRAESIDIUM" | "WERKGROEP" }[] = [], isSuperAdmin = false) =>
    ({
      user: { isSuperAdmin },
      permissions,
      groups: groups.map((g) => ({ ...g, code: g.id.toUpperCase(), slug: g.id, nameNl: g.id, nameEn: g.id, role: "MEMBER" })),
    }) as unknown as SessionPayload;

  it("laat tasks.manage elke post verdelen", () => {
    const scope = taskEditScope(session(["tasks.manage"]));
    expect(canEditTasksOf(scope, "theokot")).toBe(true);
    expect(canEditTasksOf(scope, "it")).toBe(true);
  });

  it("beperkt tasks.manageOwn tot de eigen praesidiumposten", () => {
    const scope = taskEditScope(session(["tasks.manageOwn"], [{ id: "theokot", type: "PRAESIDIUM" }, { id: "revue", type: "WERKGROEP" }]));
    expect(canEditTasksOf(scope, "theokot")).toBe(true);
    expect(canEditTasksOf(scope, "it")).toBe(false);
    expect(canEditTasksOf(scope, "revue")).toBe(false);
  });

  it("laat wie enkel mag kijken niets verdelen", () => {
    const scope = taskEditScope(session(["tasks.view"], [{ id: "theokot", type: "PRAESIDIUM" }]));
    expect(canEditAnyTasks(scope)).toBe(false);
  });

  it("laat een superadmin alles verdelen", () => {
    const scope = taskEditScope(session([], [], true));
    expect(canEditTasksOf(scope, "sport")).toBe(true);
  });
});
