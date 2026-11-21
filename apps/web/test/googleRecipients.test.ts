import { describe, expect, it } from "vitest";
import { expandRecipients, normaliseAddress, type DirectoryMember } from "@/lib/google/recipients";

const user = (email: string): DirectoryMember => ({ email, type: "USER" });
const group = (email: string): DirectoryMember => ({ email, type: "GROUP" });

function directory(groups: Record<string, DirectoryMember[]>) {
  const calls: string[] = [];
  return {
    calls,
    membersOf: async (email: string) => {
      calls.push(email);
      return groups[email] ?? null;
    },
  };
}

describe("wie krijgt de mail van een groep", () => {
  it("klapt groepen in groepen uit tot op de postbussen, met het pad erbij", async () => {
    const dir = directory({
      "loko-av@vtk.be": [user("praeses@vtk.be"), group("loko@vtk.be")],
      "loko@vtk.be": [user("jan@vtk.be"), group("loko-sub@vtk.be")],
      "loko-sub@vtk.be": [user("an@vtk.be"), { email: "extern@gmail.com", type: "EXTERNAL" }],
    });
    const result = await expandRecipients("loko-av@vtk.be", dir.membersOf);
    expect(result.mailboxes.map((m) => [m.email, m.via.join(" > ")])).toEqual([
      ["an@vtk.be", "loko-av@vtk.be > loko@vtk.be > loko-sub@vtk.be"],
      ["extern@gmail.com", "loko-av@vtk.be > loko@vtk.be > loko-sub@vtk.be"],
      ["jan@vtk.be", "loko-av@vtk.be > loko@vtk.be"],
      ["praeses@vtk.be", "loko-av@vtk.be"],
    ]);
    expect(result).toMatchObject({ groupCount: 3, depth: 2, cycles: 0 });
  });

  it("telt een postbus één keer, via het kortste pad", async () => {
    const dir = directory({
      "a@vtk.be": [group("b@vtk.be"), user("jan@vtk.be")],
      "b@vtk.be": [user("jan@vtk.be")],
    });
    const result = await expandRecipients("a@vtk.be", dir.membersOf);
    expect(result.mailboxes).toEqual([{ email: "jan@vtk.be", type: "USER", via: ["a@vtk.be"] }]);
  });

  it("loopt niet vast in een groep die zichzelf bevat, en klapt een gedeelde groep één keer uit", async () => {
    const dir = directory({
      "a@vtk.be": [group("b@vtk.be"), group("c@vtk.be")],
      "b@vtk.be": [group("a@vtk.be"), group("c@vtk.be")],
      "c@vtk.be": [user("jan@vtk.be")],
    });
    const result = await expandRecipients("a@vtk.be", dir.membersOf);
    expect(result.cycles).toBe(1);
    expect(result.mailboxes.map((m) => m.email)).toEqual(["jan@vtk.be"]);
    expect(dir.calls.filter((call) => call === "c@vtk.be")).toHaveLength(1);
    const b = result.root.children?.find((child) => child.email === "b@vtk.be");
    expect(b?.children?.find((child) => child.email === "a@vtk.be")?.cycle).toBe(true);
  });

  it("toont een groep die Google niet kan lezen, in plaats van te falen", async () => {
    const dir = directory({ "a@vtk.be": [group("geheim@vtk.be"), user("jan@vtk.be")] });
    const result = await expandRecipients("a@vtk.be", dir.membersOf);
    expect(result.root.children?.find((child) => child.email === "geheim@vtk.be")?.unreadable).toBe(true);
    expect(result.mailboxes.map((m) => m.email)).toEqual(["jan@vtk.be"]);
  });

  it("maakt van een lokaal deel een volledig adres", () => {
    expect(normaliseAddress(" Loko-AV ", "vtk.be")).toBe("loko-av@vtk.be");
    expect(normaliseAddress("x@Other.be", "vtk.be")).toBe("x@other.be");
    expect(normaliseAddress("  ", "vtk.be")).toBe("");
  });
});
