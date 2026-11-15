import { describe, expect, it } from "vitest";
import {
  desiredMembers,
  normaliseEmail,
  memberAddress,
  type KiesploegMembershipRow,
  type MemberUser,
  type MembershipRow,
} from "@/lib/google/members";

/**
 * Wie er in een groepsadres hoort. Dit is de regel waar de hele
 * Google-koppeling op draait, dus ze wordt hier vastgezet zonder database en
 * zonder Google.
 */

const YEAR = 2026;

function member(
  groupId: string,
  name: string,
  googleEmail: string | null,
  role: "MEMBER" | "LEAD" = "MEMBER",
  groupType: "PRAESIDIUM" | "WERKGROEP" = "PRAESIDIUM",
): MembershipRow {
  return { groupId, groupType, role, year: YEAR, user: { id: `u-${name}`, name, googleEmail } };
}

const jan = member("activiteiten", "Jan", "jan.peeters@vtk.be");
const ann = member("activiteiten", "Ann", "ann.desmet@vtk.be", "LEAD");
const bob = member("groep5", "Bob", "bob.mertens@vtk.be");

describe("desiredMembers", () => {
  it("neemt de leden van elke bronpost", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [
        { groupId: "activiteiten", onlyLead: false },
        { groupId: "groep5", onlyLead: false },
      ],
      memberships: [jan, ann, bob],
      extras: [],
    });
    expect(result.emails).toEqual([
      "ann.desmet@vtk.be",
      "bob.mertens@vtk.be",
      "jan.peeters@vtk.be",
    ]);
    expect(result.unlinked).toEqual([]);
  });

  it("laat een post buiten de lijst wanneer ze geen bron is", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, bob],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
  });

  it("neemt bij onlyLead enkel de verantwoordelijke", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: true }],
      memberships: [jan, ann],
      extras: [],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be"]);
  });

  it("laat de ruimste bron winnen wanneer een post twee keer staat", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [
        { groupId: "activiteiten", onlyLead: true },
        { groupId: "activiteiten", onlyLead: false },
      ],
      memberships: [jan, ann],
      extras: [],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be", "jan.peeters@vtk.be"]);
  });

  it("meldt leden zonder gekoppeld adres in plaats van ze stil over te slaan", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, member("activiteiten", "Zoe", null)],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
    expect(result.unlinked).toEqual([{ id: "u-Zoe", name: "Zoe" }]);
  });

  it("voegt losse adressen toe, ook van buiten het domein", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan],
      extras: [{ email: "oudlid@gmail.com", kind: "INCLUDE" }],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be", "oudlid@gmail.com"]);
  });

  it("laat een uitsluiting winnen van de post en van een los adres", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, ann],
      extras: [
        { email: "JAN.PEETERS@vtk.be", kind: "EXCLUDE" },
        { email: "extern@example.com", kind: "INCLUDE" },
        { email: "extern@example.com", kind: "EXCLUDE" },
      ],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be"]);
  });

  it("ontdubbelt iemand die in twee bronposten zit", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [
        { groupId: "activiteiten", onlyLead: false },
        { groupId: "groep5", onlyLead: false },
      ],
      memberships: [jan, { ...jan, groupId: "groep5" }],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
  });

  it("geeft een lege lijst wanneer een post dit werkingsjaar nog leeg is", () => {
    // Dit is precies wat er op 15 juli gebeurt: de memberships van vorig jaar
    // tellen niet mee, dus de lijst loopt leeg tot het nieuwe praesidium
    // ingevoerd is. De sync hoort dat gewoon door te zetten.
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [],
      extras: [],
    });
    expect(result.emails).toEqual([]);
  });
});

describe("normaliseEmail", () => {
  it("maakt adressen vergelijkbaar", () => {
    expect(normaliseEmail("  Jan.Peeters@VTK.be ")).toBe("jan.peeters@vtk.be");
  });
});

/** Een kiesploeg is een tweede soort bron, met eigen posten. */
function kiesploegMember(
  kiesploegId: string,
  postId: string | null,
  name: string,
  role: "MEMBER" | "LEAD" = "MEMBER",
): KiesploegMembershipRow {
  return {
    kiesploegId,
    postId,
    role,
    user: { id: `k-${name}`, name, googleEmail: `${name.toLowerCase()}@vtk.be` },
  };
}

describe("desiredMembers met een kiesploeg", () => {
  const marketing = kiesploegMember("kp", "post-marketing", "Mia");
  const g5 = kiesploegMember("kp", "post-g5", "Gus");
  const zonderPost = kiesploegMember("kp", null, "Noa");

  it("neemt de hele ploeg bij een kiesploegbron", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ kiesploegId: "kp", onlyLead: false }],
      memberships: [],
      kiesploegMemberships: [marketing, g5, zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual(["gus@vtk.be", "mia@vtk.be", "noa@vtk.be"]);
  });

  it("neemt bij een postbron enkel die post", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ kiesploegPostId: "post-marketing", onlyLead: false }],
      memberships: [],
      kiesploegMemberships: [marketing, g5, zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual(["mia@vtk.be"]);
  });

  it("zet de g5 erbij wanneer die als tweede bron staat", () => {
    // Zo maakt `createKiesploegListsAction` de lijsten: de post plus de g5, als
    // twee zichtbare rijen en niet als verstopte regel in de sync.
    const result = desiredMembers({
      year: YEAR,
      sources: [
        { kiesploegPostId: "post-marketing", onlyLead: false },
        { kiesploegPostId: "post-g5", onlyLead: false },
      ],
      memberships: [],
      kiesploegMemberships: [marketing, g5, zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual(["gus@vtk.be", "mia@vtk.be"]);
  });

  it("laat een lid zonder post buiten de postlijsten", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ kiesploegPostId: "post-marketing", onlyLead: false }],
      memberships: [],
      kiesploegMemberships: [zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual([]);
  });

  it("combineert een gewone post met een kiesploegpost", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [
        { groupId: "activiteiten", onlyLead: false },
        { kiesploegPostId: "post-marketing", onlyLead: false },
      ],
      memberships: [jan],
      kiesploegMemberships: [marketing],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be", "mia@vtk.be"]);
  });
});

describe("desiredMembers met een brontype", () => {
  const revue = member("revue", "Rik", "rik@vtk.be", "MEMBER", "WERKGROEP");

  it("neemt elke praesidiumpost bij een PRAESIDIUM-bron", () => {
    // Dit is wat praesidium@vtk.be nodig heeft, en meteen ook de sleutel tot de
    // gedeelde drive: één regel die blijft kloppen als er een post bijkomt.
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupType: "PRAESIDIUM", onlyLead: false }],
      memberships: [jan, bob, revue],
      extras: [],
    });
    expect(result.emails).toEqual(["bob.mertens@vtk.be", "jan.peeters@vtk.be"]);
  });

  it("neemt bij onlyLead enkel de verantwoordelijken van elke post", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupType: "PRAESIDIUM", onlyLead: true }],
      memberships: [jan, ann],
      extras: [],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be"]);
  });

  it("houdt werkgroepen en posten uit elkaar", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupType: "WERKGROEP", onlyLead: false }],
      memberships: [jan, revue],
      extras: [],
    });
    expect(result.emails).toEqual(["rik@vtk.be"]);
  });
});

describe("desiredMembers met een jaar", () => {
  it("telt enkel de lidmaatschappen van het jaar van de lijst", () => {
    // Een jaargroep (activiteiten_2627) volgt haar eigen jaar. Wie voor volgend
    // jaar al ingevoerd is, hoort er nog niet in.
    const next = { ...member("activiteiten", "Nina", "nina@vtk.be"), year: YEAR + 1 };
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, next],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
  });

  it("hangt de jaargroep van het lopende jaar in de hoofdgroep", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [],
      memberships: [],
      childEmails: ["Activiteiten_2627@vtk.be"],
      extras: [
        { email: "groep5@vtk.be", kind: "INCLUDE" },
        { email: "actitablet@vtk.be", kind: "INCLUDE" },
      ],
    });
    expect(result.emails).toEqual([
      "actitablet@vtk.be",
      "activiteiten_2627@vtk.be",
      "groep5@vtk.be",
    ]);
  });
});

describe("desiredMembers met een POC", () => {
  const student: MemberUser = {
    id: "u-sara",
    name: "Sara",
    googleEmail: null,
    siteEmail: "sara@student.kuleuven.be",
  };
  const vtk: MemberUser = { id: "u-tom", name: "Tom", googleEmail: "tom@vtk.be" };

  it("neemt de vertegenwoordigers van het verkozen jaar, niet van een vooraf ingevoerd jaar", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ pocId: "ene", onlyLead: false }],
      memberships: [],
      pocRepresentatives: [
        { pocId: "ene", year: YEAR, user: vtk },
        { pocId: "ene", year: YEAR + 1, user: student },
      ],
      pocYears: { ene: YEAR },
      extras: [],
    });
    expect(result.emails).toEqual(["tom@vtk.be"]);
  });

  it("valt voor een student zonder @vtk.be-account terug op het adres van de site", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ pocId: "ene", onlyLead: false }],
      memberships: [],
      pocRepresentatives: [{ pocId: "ene", year: YEAR + 1, user: student }],
      pocYears: { ene: YEAR + 1 },
      extras: [],
    });
    expect(result.emails).toEqual(["sara@student.kuleuven.be"]);
    expect(result.unlinked).toEqual([]);
  });
});

describe("desiredMembers met een werkgroep", () => {
  const statix = "statix";
  const lien: MemberUser = {
    id: "u-lien",
    name: "Lien",
    googleEmail: "lien.peeters@vtk.be",
    werkgroepEmails: { [statix]: "statix.lien.peeters@vtk.be" },
  };

  it("geeft in een lijst van de werkgroep het werkgroepadres", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [],
      memberships: [],
      ownerGroupId: statix,
      extras: [{ user: lien, kind: "INCLUDE" }],
    });
    expect(result.emails).toEqual(["statix.lien.peeters@vtk.be"]);
  });

  it("geeft elders het persoonlijke adres", () => {
    expect(memberAddress(lien, null)).toBe("lien.peeters@vtk.be");
    expect(memberAddress(lien, "revue")).toBe("lien.peeters@vtk.be");
  });

  it("valt zonder persoonlijk account terug op het werkgroepadres", () => {
    const enkelStatix: MemberUser = { ...lien, googleEmail: null };
    expect(memberAddress(enkelStatix, null)).toBe("statix.lien.peeters@vtk.be");
  });

  it("toont een los lid zonder account als ongekoppeld", () => {
    const zonder: MemberUser = { id: "u-x", name: "Xavier", googleEmail: null };
    const result = desiredMembers({
      year: YEAR,
      sources: [],
      memberships: [],
      ownerGroupId: statix,
      extras: [{ user: zonder, kind: "INCLUDE" }],
    });
    expect(result.emails).toEqual([]);
    expect(result.unlinked).toEqual([{ id: "u-x", name: "Xavier" }]);
  });

  it("laat een uitgesloten lid ook met zijn werkgroepadres buiten de lijst", () => {
    const result = desiredMembers({
      year: YEAR,
      sources: [{ groupId: statix, onlyLead: false }],
      memberships: [{ groupId: statix, groupType: "WERKGROEP", role: "MEMBER", year: YEAR, user: lien }],
      extras: [{ user: lien, kind: "EXCLUDE" }],
    });
    expect(result.emails).toEqual([]);
  });
});
