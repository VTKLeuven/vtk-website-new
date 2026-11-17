import { describe, expect, it } from "vitest";
import { explainNoPoc, type ExplainPoc, type RoleAccount } from "@/lib/discord/pocRoles";

const account = (over: Partial<RoleAccount> = {}): RoleAccount => ({
  live: true,
  confirmed: true,
  programmes: ["ENERGY"],
  years: ["MASTER_1"],
  ...over,
});

const poc = (over: Partial<ExplainPoc>): ExplainPoc => ({
  name: "Energie",
  studyProgrammes: ["ENERGY"],
  discordRoles: [],
  ...over,
});

describe("waarom een gekoppeld account geen POC-kanaal krijgt", () => {
  it("zegt dat er geen richting op het account staat", () => {
    expect(explainNoPoc([poc({})], account({ programmes: [] }))).toEqual([{ kind: "noProgramme" }]);
  });

  it("noemt een richting zonder POC", () => {
    expect(explainNoPoc([], account())).toEqual([{ kind: "noPoc", programme: "ENERGY" }]);
  });

  it("noemt een POC zonder Discord-rol", () => {
    expect(explainNoPoc([poc({})], account())).toEqual([{ kind: "noRole", poc: "Energie" }]);
  });

  it("noemt een rol voor andere fases", () => {
    const reasons = explainNoPoc(
      [poc({ discordRoles: [{ roleId: "1", studyYears: ["MASTER_2"] }] })],
      account(),
    );
    expect(reasons).toEqual([{ kind: "otherYears", poc: "Energie", years: ["MASTER_2"] }]);
  });

  it("zegt niets over een POC die wel past", () => {
    expect(explainNoPoc([poc({ discordRoles: [{ roleId: "1", studyYears: [] }] })], account())).toEqual([]);
  });
});
